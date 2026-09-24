const { Op } = require('sequelize');
const { getPostgres } = require('../db/postgres');
const { initializeModels } = require('../db/models');
const ApiError = require('../utils/ApiError');
const { ACCOUNT, REF } = require('../utils/finance');
const { resolveUnitPrice, calculateInvoiceTotals } = require('./invoiceCalculationService');
const { resolveSettlement } = require('../utils/paymentSplit');
const journalService = require('./journalService');
const stockService = require('./stockService');
const counterService = require('./counterService');
const gatePassService = require('./gatePassService');
const { parsePagination, escapeLike } = require('../utils/query');
const { resolveStoreScope, storeWhere, assertStoreAccess } = require('../utils/storeScope');
const dayEndService = require('./dayEndService');

/**
 * The mirror of the POS sale flow: a vendor buying stock from us instead of
 * the other way around. Kept as its own document type (rather than folded
 * into Sale, which is deeply Customer-specific — credit/balance/gate-pass
 * logic) but reuses the same building blocks: invoiceCalculationService for
 * pricing/totals, paymentSplit for the cash/online/credit split, stockService
 * to issue stock and capture COGS, and journalService for the accounting
 * entries — posted against ACCOUNT.AR_VENDOR instead of ACCOUNT.AR, since
 * this is a receivable from the vendor, independent of whatever we may
 * separately owe that same vendor (ACCOUNT.AP) for stock sourced from them.
 */

async function reloadWithAssociations(id, transaction) {
  const { VendorSale, VendorSaleItem, Vendor, Store, Warehouse } = initializeModels();
  return VendorSale.findByPk(id, {
    include: [
      { model: VendorSaleItem, as: 'items', separate: true, order: [['position', 'ASC']] },
      { model: Vendor, as: 'vendorInfo', attributes: ['id', 'name', 'phone'] },
      { model: Store, as: 'storeInfo', attributes: ['id', 'name', 'code'] },
      { model: Warehouse, as: 'warehouseInfo', attributes: ['id', 'name'] },
    ],
    transaction,
  });
}

async function createVendorSale(
  actor,
  {
    vendor,
    store,
    warehouse,
    date,
    items,
    discount,
    taxPercent,
    paymentMethod,
    cashAmount,
    onlineAmount,
    bankAccount,
    transferReceiptRef,
    note,
  },
) {
  return getPostgres().transaction(async (transaction) => {
    const { VendorSale, VendorSaleItem, Vendor, Store, Warehouse, Product } = initializeModels();

    const vendorDoc = await Vendor.findByPk(vendor, { transaction });
    if (!vendorDoc) throw ApiError.notFound('Vendor not found');
    const storeDoc = await Store.findByPk(store, { transaction });
    if (!storeDoc) throw ApiError.badRequest('A store is required');
    assertStoreAccess(actor, storeDoc.id);
    if (String(vendorDoc.store) !== String(storeDoc.id)) {
      throw ApiError.notFound('Vendor not found');
    }
    const warehouseDoc = await Warehouse.findByPk(warehouse, { transaction });
    if (!warehouseDoc) throw ApiError.notFound('Warehouse not found');
    if (!Array.isArray(items) || items.length === 0) {
      throw ApiError.badRequest('At least one item is required');
    }

    const products = await Product.findAll({
      where: { id: items.map((it) => it.product) },
      transaction,
    });
    const productsById = new Map(products.map((p) => [String(p.id), p]));

    const pricedItems = items.map((it) => {
      const product = productsById.get(String(it.product));
      if (!product) throw ApiError.notFound(`Product not found: ${it.product}`);
      return {
        product: product.id,
        name: product.name,
        quantity: it.quantity,
        unitPrice: resolveUnitPrice(it.unitPrice, product.salePrice),
      };
    });

    const totals = calculateInvoiceTotals(pricedItems, { discount, taxPercent });

    const { cash, online, credit } = resolveSettlement({
      method: paymentMethod,
      total: totals.total,
      cashReceived: cashAmount,
      onlineReceived: onlineAmount,
    });

    let bankRef = null;
    if (online > 0 && bankAccount) {
      const { BankAccount } = initializeModels();
      const bank = await BankAccount.findByPk(bankAccount, { transaction });
      if (!bank) throw ApiError.notFound('Bank account not found');
      if (bank.store && String(bank.store) !== String(storeDoc.id)) {
        throw ApiError.badRequest('That bank account does not belong to this store');
      }
      bankRef = bank.id;
    }

    const when = await dayEndService.businessTimestamp(
      storeDoc.id,
      date ? new Date(date) : new Date(),
      transaction,
    );
    const number = await counterService.nextDocNumber('VSL', when.getFullYear(), 6, transaction);

    // Issue stock and capture COGS per line — this is stock physically
    // leaving our warehouse to the vendor, same as any other sale.
    let cost = 0;
    const lineItems = [];
    for (const li of totals.items) {
      const lineCost = await stockService.issueStock(
        li.product,
        warehouseDoc.id,
        li.quantity,
        { refType: REF.VENDOR_SALE, refNo: number, date: when },
        transaction,
      );
      cost += lineCost;
      lineItems.push({ ...li, cost: lineCost });
    }

    const vendorSale = await VendorSale.create(
      {
        number,
        vendor: vendorDoc.id,
        vendorName: vendorDoc.name,
        store: storeDoc.id,
        warehouse: warehouseDoc.id,
        date: when,
        subtotal: totals.subtotal,
        discount: totals.discount,
        taxPercent: totals.taxPercent,
        tax: totals.tax,
        total: totals.total,
        cost,
        paymentMethod,
        cashAmount: cash,
        onlineAmount: online,
        creditAmount: credit,
        bankAccount: bankRef,
        transferReceiptRef: (transferReceiptRef || '').trim(),
        note: (note || '').trim(),
        createdBy: actor ? actor.id : null,
      },
      { transaction },
    );
    await VendorSaleItem.bulkCreate(
      lineItems.map((li, position) => ({ vendorSaleId: vendorSale.id, position, ...li })),
      { transaction },
    );

    // Revenue: Dr Cash/Bank/AR_VENDOR(vendor) ... Cr Sales, Cr Tax.
    const revenueLines = [];
    if (cash > 0) revenueLines.push(journalService.line(ACCOUNT.CASH, { debit: cash }));
    if (online > 0)
      revenueLines.push(journalService.line(ACCOUNT.BANK, { debit: online, ref: bankRef }));
    if (credit > 0) {
      revenueLines.push(
        journalService.line(ACCOUNT.AR_VENDOR, { debit: credit, ref: vendorDoc.id }),
      );
    }
    const salesCredit = totals.taxableAmount;
    if (salesCredit > 0)
      revenueLines.push(journalService.line(ACCOUNT.SALES, { credit: salesCredit }));
    if (totals.tax > 0) revenueLines.push(journalService.line(ACCOUNT.TAX, { credit: totals.tax }));

    if (revenueLines.length > 0) {
      await journalService.post({
        date: when,
        description: `Vendor sale ${number}`,
        refType: REF.VENDOR_SALE,
        refId: vendorSale.id,
        refNo: number,
        warehouse: warehouseDoc.id,
        store: storeDoc.id,
        createdBy: actor ? actor.id : null,
        transaction,
        lines: revenueLines,
      });
    }

    // Cost of goods sold: Dr COGS / Cr Inventory.
    if (cost > 0) {
      await journalService.post({
        date: when,
        description: `COGS for vendor sale ${number}`,
        refType: REF.VENDOR_SALE,
        refId: vendorSale.id,
        refNo: number,
        warehouse: warehouseDoc.id,
        store: storeDoc.id,
        createdBy: actor ? actor.id : null,
        transaction,
        lines: [
          journalService.line(ACCOUNT.COGS, { debit: cost }),
          journalService.line(ACCOUNT.INVENTORY, { credit: cost }),
        ],
      });
    }

    // Gate pass documenting what's physically leaving the warehouse for the
    // vendor — created inside this same transaction so a gate-pass failure
    // rolls back the whole vendor sale, same atomicity model as a POS sale.
    const gatePass = await gatePassService.createForVendorSale(
      {
        id: vendorSale.id,
        number,
        vendorName: vendorDoc.name,
        store: storeDoc.id,
        warehouse: warehouseDoc.id,
        date: when,
        items: lineItems,
        createdBy: actor ? actor.id : null,
      },
      transaction,
    );
    await vendorSale.update({ gatePass: gatePass.id }, { transaction });

    return reloadWithAssociations(vendorSale.id, transaction);
  });
}

// Reverses the revenue + COGS journal entries a vendor sale posted at
// creation time, by reconstructing them from the sale's own stored totals —
// mirror of saleService's reverseSaleJournalEntries, posted against
// ACCOUNT.AR_VENDOR instead of ACCOUNT.AR. Journal entries are append-only,
// so a correction is always "reverse, then post fresh" rather than editing
// the original.
async function reverseVendorSaleJournalEntries(vendorSale, actor, when, transaction) {
  const salesCredit = vendorSale.subtotal - vendorSale.discount;

  const reverseLines = [];
  if (vendorSale.cashAmount > 0)
    reverseLines.push(journalService.line(ACCOUNT.CASH, { credit: vendorSale.cashAmount }));
  if (vendorSale.onlineAmount > 0) {
    reverseLines.push(
      journalService.line(ACCOUNT.BANK, {
        credit: vendorSale.onlineAmount,
        ref: vendorSale.bankAccount,
      }),
    );
  }
  if (vendorSale.creditAmount > 0) {
    reverseLines.push(
      journalService.line(ACCOUNT.AR_VENDOR, {
        credit: vendorSale.creditAmount,
        ref: vendorSale.vendor,
      }),
    );
  }
  if (salesCredit > 0)
    reverseLines.push(journalService.line(ACCOUNT.SALES, { debit: salesCredit }));
  if (vendorSale.tax > 0)
    reverseLines.push(journalService.line(ACCOUNT.TAX, { debit: vendorSale.tax }));

  if (reverseLines.length > 0) {
    await journalService.post({
      date: when,
      description: `Reversal for edited vendor sale ${vendorSale.number}`,
      refType: REF.VENDOR_SALE,
      refId: vendorSale.id,
      refNo: vendorSale.number,
      warehouse: vendorSale.warehouse,
      store: vendorSale.store,
      createdBy: actor ? actor.id : null,
      transaction,
      lines: reverseLines,
    });
  }

  if (vendorSale.cost > 0) {
    await journalService.post({
      date: when,
      description: `COGS reversal for edited vendor sale ${vendorSale.number}`,
      refType: REF.VENDOR_SALE,
      refId: vendorSale.id,
      refNo: vendorSale.number,
      warehouse: vendorSale.warehouse,
      store: vendorSale.store,
      createdBy: actor ? actor.id : null,
      transaction,
      lines: [
        journalService.line(ACCOUNT.COGS, { credit: vendorSale.cost }),
        journalService.line(ACCOUNT.INVENTORY, { debit: vendorSale.cost }),
      ],
    });
  }
}

/**
 * Full edit — replaces a vendor sale's items (and discount/tax/note/
 * warehouse) and recalculates totals, reversing and reapplying stock + the
 * revenue/COGS journal entries. Cash/bank amounts already settled at
 * creation are left untouched; only the resulting credit (on account)
 * balance is recalculated. Blocked once the sale has any returns against it,
 * same rule as saleService.updateSale.
 */
async function updateVendorSale(actor, vendorSaleId, input) {
  return getPostgres().transaction(async (transaction) => {
    const { VendorSale, VendorSaleItem, Product, Warehouse } = initializeModels();

    const vendorSale = await VendorSale.findByPk(vendorSaleId, {
      include: [
        { model: VendorSaleItem, as: 'items', separate: true, order: [['position', 'ASC']] },
      ],
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!vendorSale) throw ApiError.notFound('Vendor sale not found');
    assertStoreAccess(actor, vendorSale.store);
    if (vendorSale.returnedTotal > 0) {
      throw ApiError.badRequest(
        'This vendor sale has product returns against it and can no longer be edited',
      );
    }
    if (vendorSale.gatePass) {
      const { GatePass } = initializeModels();
      const gatePass = await GatePass.findByPk(vendorSale.gatePass, { transaction });
      if (gatePass && ['PROCESSED', 'USED'].includes(gatePass.status)) {
        throw ApiError.badRequest(
          'This vendor sale’s gate pass has already been processed and it can no longer be edited',
        );
      }
    }

    const { warehouse, items, discount = 0, taxPercent = 0, note } = input;

    if (!Array.isArray(items) || items.length === 0) {
      throw ApiError.badRequest('At least one item is required');
    }

    const warehouseDoc = await Warehouse.findByPk(warehouse || vendorSale.warehouse, {
      transaction,
    });
    if (!warehouseDoc) throw ApiError.notFound('Warehouse not found');

    const products = await Product.findAll({
      where: { id: items.map((it) => it.product) },
      transaction,
    });
    const productsById = new Map(products.map((p) => [String(p.id), p]));

    // Reverse the sale's original stock issuance, at the exact original cost,
    // before validating the revised line items — same ordering/rationale as
    // saleService.updateSale.
    const originalItems = vendorSale.items.map((li) => li.toJSON());
    for (const li of originalItems) {
      await stockService.receiveStock(
        li.product,
        vendorSale.warehouse,
        li.quantity,
        0,
        { refType: REF.VENDOR_SALE, refNo: vendorSale.number, date: new Date() },
        li.cost,
        transaction,
      );
    }

    const pricedItems = items.map((it) => {
      const product = productsById.get(String(it.product));
      if (!product) throw ApiError.notFound(`Product not found: ${it.product}`);
      return {
        product: product.id,
        name: product.name,
        quantity: it.quantity,
        unitPrice: resolveUnitPrice(it.unitPrice, product.salePrice),
      };
    });

    const totals = calculateInvoiceTotals(pricedItems, { discount, taxPercent });

    const when = new Date();

    let cost = 0;
    const lineItems = [];
    for (const li of totals.items) {
      const lineCost = await stockService.issueStock(
        li.product,
        warehouseDoc.id,
        li.quantity,
        { refType: REF.VENDOR_SALE, refNo: vendorSale.number, date: vendorSale.date },
        transaction,
      );
      cost += lineCost;
      lineItems.push({ ...li, cost: lineCost });
    }

    // What was already collected/settled at creation doesn't change on an
    // item edit — only the still-owed credit balance does.
    const newCredit = Math.max(0, totals.total - vendorSale.cashAmount - vendorSale.onlineAmount);

    // Reverse the original revenue + COGS entries (using the sale's own
    // pre-edit stored totals), then post fresh ones below for the revision.
    await reverseVendorSaleJournalEntries(vendorSale, actor, when, transaction);

    await VendorSaleItem.destroy({ where: { vendorSaleId: vendorSale.id }, transaction });
    await VendorSaleItem.bulkCreate(
      lineItems.map((li, position) => ({ vendorSaleId: vendorSale.id, position, ...li })),
      { transaction },
    );

    vendorSale.warehouse = warehouseDoc.id;
    vendorSale.subtotal = totals.subtotal;
    vendorSale.discount = totals.discount;
    vendorSale.taxPercent = totals.taxPercent;
    vendorSale.tax = totals.tax;
    vendorSale.total = totals.total;
    vendorSale.cost = cost;
    vendorSale.creditAmount = newCredit;
    if (note !== undefined) vendorSale.note = (note || '').trim();
    vendorSale.lastEditedAt = when;
    vendorSale.lastEditedBy = actor ? actor.id : null;
    await vendorSale.save({ transaction });

    const revenueLines = [];
    if (vendorSale.cashAmount > 0)
      revenueLines.push(journalService.line(ACCOUNT.CASH, { debit: vendorSale.cashAmount }));
    if (vendorSale.onlineAmount > 0) {
      revenueLines.push(
        journalService.line(ACCOUNT.BANK, {
          debit: vendorSale.onlineAmount,
          ref: vendorSale.bankAccount,
        }),
      );
    }
    if (newCredit > 0) {
      revenueLines.push(
        journalService.line(ACCOUNT.AR_VENDOR, { debit: newCredit, ref: vendorSale.vendor }),
      );
    }
    const salesCredit = totals.taxableAmount;
    if (salesCredit > 0)
      revenueLines.push(journalService.line(ACCOUNT.SALES, { credit: salesCredit }));
    if (totals.tax > 0) revenueLines.push(journalService.line(ACCOUNT.TAX, { credit: totals.tax }));

    if (revenueLines.length > 0) {
      await journalService.post({
        date: when,
        description: `Revised vendor sale ${vendorSale.number}`,
        refType: REF.VENDOR_SALE,
        refId: vendorSale.id,
        refNo: vendorSale.number,
        warehouse: warehouseDoc.id,
        store: vendorSale.store,
        createdBy: actor ? actor.id : null,
        transaction,
        lines: revenueLines,
      });
    }

    if (cost > 0) {
      await journalService.post({
        date: when,
        description: `COGS for revised vendor sale ${vendorSale.number}`,
        refType: REF.VENDOR_SALE,
        refId: vendorSale.id,
        refNo: vendorSale.number,
        warehouse: warehouseDoc.id,
        store: vendorSale.store,
        createdBy: actor ? actor.id : null,
        transaction,
        lines: [
          journalService.line(ACCOUNT.COGS, { debit: cost }),
          journalService.line(ACCOUNT.INVENTORY, { credit: cost }),
        ],
      });
    }

    // Refreshes the sale's existing gate pass in place (rather than minting a
    // duplicate) unless it's already been processed/used at the gate — see
    // gatePassService.createForVendorSale.
    const gatePass = await gatePassService.createForVendorSale(
      {
        id: vendorSale.id,
        number: vendorSale.number,
        vendorName: vendorSale.vendorName,
        store: vendorSale.store,
        warehouse: warehouseDoc.id,
        date: vendorSale.date,
        items: lineItems,
        createdBy: vendorSale.createdBy,
      },
      transaction,
    );
    if (String(vendorSale.gatePass) !== String(gatePass.id)) {
      vendorSale.gatePass = gatePass.id;
      await vendorSale.save({ transaction });
    }

    return reloadWithAssociations(vendorSale.id, transaction);
  });
}

async function getVendorSale(actor, id) {
  const vendorSale = await reloadWithAssociations(id);
  if (!vendorSale) throw ApiError.notFound('Vendor sale not found');
  assertStoreAccess(actor, vendorSale.store);
  return vendorSale;
}

async function listVendorSales({
  vendor,
  store,
  warehouse,
  from,
  to,
  search,
  actor,
  ...query
} = {}) {
  const { VendorSale, VendorSaleItem, Vendor, Store, Warehouse } = initializeModels();
  const { page, limit, skip } = parsePagination(query);
  const where = {};
  if (vendor) where.vendor = vendor;
  if (warehouse) where.warehouse = warehouse;
  if (from || to) {
    where.date = {};
    if (from) where.date[Op.gte] = new Date(from);
    if (to) where.date[Op.lte] = new Date(to);
  }
  if (search) {
    const term = `%${escapeLike(search)}%`;
    where[Op.or] = [{ number: { [Op.iLike]: term } }, { vendorName: { [Op.iLike]: term } }];
  }
  const { storeIds } = await resolveStoreScope({ store, actor });
  if (storeIds) Object.assign(where, storeWhere(storeIds));

  const { rows, count } = await VendorSale.findAndCountAll({
    where,
    include: [
      { model: VendorSaleItem, as: 'items', separate: true, order: [['position', 'ASC']] },
      { model: Vendor, as: 'vendorInfo', attributes: ['id', 'name', 'phone'] },
      { model: Store, as: 'storeInfo', attributes: ['id', 'name', 'code'] },
      { model: Warehouse, as: 'warehouseInfo', attributes: ['id', 'name'] },
    ],
    order: [
      ['date', 'DESC'],
      ['createdAt', 'DESC'],
    ],
    offset: skip,
    limit,
    distinct: true,
  });
  return { vendorSales: rows, total: count, page, limit };
}

module.exports = { createVendorSale, getVendorSale, listVendorSales, updateVendorSale };
