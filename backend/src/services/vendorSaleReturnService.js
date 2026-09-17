const { QueryTypes } = require('sequelize');
const { getPostgres } = require('../db/postgres');
const { initializeModels } = require('../db/models');
const ApiError = require('../utils/ApiError');
const { ACCOUNT, REF } = require('../utils/finance');
const journalService = require('./journalService');
const stockService = require('./stockService');
const counterService = require('./counterService');
const { requirePositiveQuantity, normalizeQuantity } = require('../utils/quantity');
const { assertStoreAccess } = require('../utils/storeScope');

/**
 * Product returns against a vendor sale — the mirror of saleReturnService,
 * but simpler: every VendorSaleItem line always comes from the vendor
 * sale's single warehouse (no per-line WAREHOUSE/VENDOR source split like a
 * customer Sale has), and vendor sales carry no gate pass today, so a
 * return doesn't post one either. Restocks the warehouse at the exact cost
 * the item was issued at, and posts reversing journal entries crediting the
 * vendor's receivable (AR_VENDOR) — reduces what they still owe us, or
 * grows their standing credit if the sale carried no balance.
 */

// Quantities already returned in prior (partial) returns against this
// vendor sale, per product — a line can't be over-returned across
// multiple visits.
async function alreadyReturnedByProduct(vendorSaleId, transaction) {
  const rows = await getPostgres().query(
    `SELECT vsri.product_id AS product, SUM(vsri.quantity) AS quantity
     FROM vendor_sale_return_items vsri
     JOIN vendor_sale_returns vsr ON vsr.id = vsri.vendor_sale_return_id
     WHERE vsr.vendor_sale_id = :vendorSaleId
     GROUP BY vsri.product_id`,
    { replacements: { vendorSaleId }, transaction, type: QueryTypes.SELECT },
  );
  const map = new Map();
  for (const row of rows) map.set(String(row.product), row.quantity);
  return map;
}

async function reloadWithAssociations(id, transaction) {
  const { VendorSaleReturn, VendorSaleReturnItem, Vendor, Warehouse } = initializeModels();
  return VendorSaleReturn.findByPk(id, {
    include: [
      { model: VendorSaleReturnItem, as: 'items', separate: true, order: [['position', 'ASC']] },
      { model: Vendor, as: 'vendorInfo', attributes: ['id', 'name'] },
      { model: Warehouse, as: 'warehouseInfo', attributes: ['id', 'name'] },
    ],
    transaction,
  });
}

async function createReturn(actor, vendorSaleId, { items, note }) {
  return getPostgres().transaction(async (transaction) => {
    const { VendorSale, VendorSaleItem, VendorSaleReturn, VendorSaleReturnItem } =
      initializeModels();

    const vendorSale = await VendorSale.findByPk(vendorSaleId, {
      include: [
        { model: VendorSaleItem, as: 'items', separate: true, order: [['position', 'ASC']] },
      ],
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!vendorSale) throw ApiError.notFound('Vendor sale not found');
    assertStoreAccess(actor, vendorSale.store);
    if (!Array.isArray(items) || items.length === 0) {
      throw ApiError.badRequest('At least one returned item is required');
    }

    const alreadyReturned = await alreadyReturnedByProduct(vendorSale.id, transaction);
    const saleItemsByProduct = new Map(vendorSale.items.map((it) => [String(it.product), it]));

    const returnLines = [];
    let returnSubtotal = 0;
    for (const it of items) {
      const originalLine = saleItemsByProduct.get(String(it.product));
      if (!originalLine)
        throw ApiError.badRequest(`Product ${it.product} was not part of this vendor sale`);
      const quantity = requirePositiveQuantity(it.quantity, 'Return quantity must be positive');
      const returnedSoFar = alreadyReturned.get(String(it.product)) || 0;
      const availableToReturn = normalizeQuantity(originalLine.quantity - returnedSoFar);
      if (quantity > availableToReturn) {
        throw ApiError.badRequest(
          `Cannot return ${quantity} of ${originalLine.name} — only ${availableToReturn} remain returnable`,
        );
      }

      const lineTotal = Math.round(originalLine.unitPrice * quantity);
      const lineCost =
        originalLine.quantity > 0
          ? Math.round((originalLine.cost / originalLine.quantity) * quantity)
          : 0;

      returnLines.push({
        product: originalLine.product,
        name: originalLine.name,
        quantity,
        unitPrice: originalLine.unitPrice,
        lineTotal,
        cost: lineCost,
      });
      returnSubtotal += lineTotal;
    }

    // Apportion the original sale's discount/tax onto this return,
    // proportional to how much of the sale's subtotal it represents —
    // mirrors saleReturnService / calculateInvoiceTotals.
    const returnDiscount =
      vendorSale.subtotal > 0
        ? Math.round((vendorSale.discount * returnSubtotal) / vendorSale.subtotal)
        : 0;
    const returnNet = returnSubtotal - returnDiscount;
    const returnTax = Math.round((returnNet * vendorSale.taxPercent) / 100);
    const returnTotal = returnNet + returnTax;

    const remaining = Math.max(0, vendorSale.total - vendorSale.returnedTotal);
    if (returnTotal > remaining) {
      throw ApiError.badRequest("Return amount exceeds the vendor sale's remaining value");
    }

    const when = new Date();
    const number = await counterService.nextDocNumber('VSLRTN', when.getFullYear(), 6, transaction);

    // Restock at the exact original cost, so the moving average is undone
    // precisely rather than blended with today's.
    let returnCost = 0;
    for (const line of returnLines) {
      if (!line.quantity) continue;
      const received = await stockService.receiveStock(
        line.product,
        vendorSale.warehouse,
        line.quantity,
        0,
        { refType: REF.VENDOR_SALE_RETURN, refNo: number, date: when },
        line.cost,
        transaction,
      );
      returnCost += received;
    }

    const vendorSaleReturn = await VendorSaleReturn.create(
      {
        number,
        vendorSale: vendorSale.id,
        vendorSaleNumber: vendorSale.number,
        vendor: vendorSale.vendor,
        vendorName: vendorSale.vendorName,
        warehouse: vendorSale.warehouse,
        date: when,
        subtotal: returnSubtotal,
        discount: returnDiscount,
        tax: returnTax,
        total: returnTotal,
        cost: returnCost,
        note: (note || '').trim(),
        createdBy: actor ? actor.id : null,
      },
      { transaction },
    );
    await VendorSaleReturnItem.bulkCreate(
      returnLines.map((li, position) => ({
        vendorSaleReturnId: vendorSaleReturn.id,
        position,
        ...li,
      })),
      { transaction },
    );

    vendorSale.returnedTotal += returnTotal;
    await vendorSale.save({ transaction });

    // Reverse revenue/tax for the returned portion, debiting the vendor's
    // receivable (reduces what they owe, or grows their standing credit).
    const reverseLines = [];
    if (returnNet > 0) reverseLines.push(journalService.line(ACCOUNT.SALES, { debit: returnNet }));
    if (returnTax > 0) reverseLines.push(journalService.line(ACCOUNT.TAX, { debit: returnTax }));
    if (returnTotal > 0) {
      reverseLines.push(
        journalService.line(ACCOUNT.AR_VENDOR, { credit: returnTotal, ref: vendorSale.vendor }),
      );
    }
    if (reverseLines.length > 0) {
      await journalService.post({
        date: when,
        description: `Return ${number} against vendor sale ${vendorSale.number}`,
        refType: REF.VENDOR_SALE_RETURN,
        refId: vendorSaleReturn.id,
        refNo: number,
        warehouse: vendorSale.warehouse,
        store: vendorSale.store,
        createdBy: actor ? actor.id : null,
        transaction,
        lines: reverseLines,
      });
    }

    if (returnCost > 0) {
      await journalService.post({
        date: when,
        description: `Inventory restock for return ${number}`,
        refType: REF.VENDOR_SALE_RETURN,
        refId: vendorSaleReturn.id,
        refNo: number,
        warehouse: vendorSale.warehouse,
        store: vendorSale.store,
        createdBy: actor ? actor.id : null,
        transaction,
        lines: [
          journalService.line(ACCOUNT.INVENTORY, { debit: returnCost }),
          journalService.line(ACCOUNT.COGS, { credit: returnCost }),
        ],
      });
    }

    return reloadWithAssociations(vendorSaleReturn.id, transaction);
  });
}

async function listReturnsForVendorSale(actor, vendorSaleId) {
  const { VendorSale, VendorSaleReturn, VendorSaleReturnItem } = initializeModels();
  const vendorSale = await VendorSale.findByPk(vendorSaleId, { attributes: ['id', 'store'] });
  if (!vendorSale) throw ApiError.notFound('Vendor sale not found');
  assertStoreAccess(actor, vendorSale.store);

  return VendorSaleReturn.findAll({
    where: { vendorSale: vendorSaleId },
    include: [
      { model: VendorSaleReturnItem, as: 'items', separate: true, order: [['position', 'ASC']] },
    ],
    order: [['createdAt', 'DESC']],
  });
}

module.exports = { createReturn, listReturnsForVendorSale };
