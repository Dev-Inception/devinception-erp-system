const { Op, QueryTypes } = require('sequelize');
const { getPostgres } = require('../db/postgres');
const { initializeModels } = require('../db/models');
const ApiError = require('../utils/ApiError');
const { ACCOUNT, REF } = require('../utils/finance');
const journalService = require('./journalService');
const stockService = require('./stockService');
const counterService = require('./counterService');
const gatePassService = require('./gatePassService');
const { requirePositiveQuantity, normalizeQuantity } = require('../utils/quantity');
const { parsePagination, escapeLike } = require('../utils/query');

/**
 * Product returns against a completed sale. Each return is its own numbered
 * document, restocks WAREHOUSE-sourced lines (at the exact cost they were
 * issued at) back into their original warehouse, and posts reversing journal
 * entries for revenue/tax/COGS — the standard append-only correction pattern.
 * Everything runs inside one transaction.
 *
 * Requires the sale to have a customer: the reversed revenue/tax needs a
 * balancing credit, and here that's always Accounts Receivable for that
 * customer (reducing what they owe, or increasing their standing credit if
 * the sale carried no balance) rather than a cash refund out the drawer.
 */

// Quantities already returned in prior (partial) returns against this sale,
// per product — a line can't be over-returned across multiple visits.
async function alreadyReturnedByProduct(saleId, transaction) {
  const rows = await getPostgres().query(
    `SELECT sri.product_id AS product, SUM(sri.quantity) AS quantity
     FROM sale_return_items sri
     JOIN sale_returns sr ON sr.id = sri.sale_return_id
     WHERE sr.sale_id = :saleId
     GROUP BY sri.product_id`,
    { replacements: { saleId }, transaction, type: QueryTypes.SELECT },
  );
  const map = new Map();
  for (const row of rows) map.set(String(row.product), row.quantity);
  return map;
}

async function reloadWithAssociations(id, transaction) {
  const { SaleReturn, SaleReturnItem, ReturnWarehouseGatePass, Customer } = initializeModels();
  return SaleReturn.findByPk(id, {
    include: [
      { model: SaleReturnItem, as: 'items', separate: true, order: [['position', 'ASC']] },
      { model: ReturnWarehouseGatePass, as: 'warehouseGatePasses', separate: true },
      { model: Customer, as: 'customerInfo', attributes: ['id', 'name', 'phone'] },
    ],
    transaction,
  });
}

async function createReturn(actor, saleId, { items, note }) {
  return getPostgres().transaction(async (transaction) => {
    const { Sale, SaleItem, SaleReturn, SaleReturnItem, ReturnWarehouseGatePass } =
      initializeModels();

    const sale = await Sale.findByPk(saleId, {
      include: [{ model: SaleItem, as: 'items', separate: true, order: [['position', 'ASC']] }],
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!sale) throw ApiError.notFound('Sale not found');
    if (!sale.customer) {
      throw ApiError.badRequest('Returns require the sale to have a customer on file');
    }
    if (!Array.isArray(items) || items.length === 0) {
      throw ApiError.badRequest('At least one returned item is required');
    }

    const alreadyReturned = await alreadyReturnedByProduct(sale.id, transaction);
    const saleItemsByProduct = new Map(sale.items.map((it) => [String(it.product), it]));

    const returnLines = [];
    let returnSubtotal = 0;
    for (const it of items) {
      const originalLine = saleItemsByProduct.get(String(it.product));
      if (!originalLine)
        throw ApiError.badRequest(`Product ${it.product} was not part of this sale`);
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
        originalLine.source === 'WAREHOUSE' && originalLine.quantity > 0
          ? Math.round((originalLine.cost / originalLine.quantity) * quantity)
          : 0;

      returnLines.push({
        product: originalLine.product,
        name: originalLine.name,
        quantity,
        unitPrice: originalLine.unitPrice,
        lineTotal,
        cost: lineCost,
        source: originalLine.source,
        warehouse: originalLine.source === 'WAREHOUSE' ? originalLine.warehouse : null,
      });
      returnSubtotal += lineTotal;
    }

    // Apportion the original sale's discount/tax onto this return,
    // proportional to how much of the sale's subtotal it represents —
    // mirrors how calculateInvoiceTotals applies a single order-level
    // discount before tax.
    const returnDiscount =
      sale.subtotal > 0 ? Math.round((sale.discount * returnSubtotal) / sale.subtotal) : 0;
    const returnNet = returnSubtotal - returnDiscount;
    const returnTax = Math.round((returnNet * sale.taxPercent) / 100);
    const returnTotal = returnNet + returnTax;

    const remaining = Math.max(0, sale.total - sale.returnedTotal);
    if (returnTotal > remaining) {
      throw ApiError.badRequest("Return amount exceeds the sale's remaining value");
    }

    const when = new Date();
    const number = await counterService.nextDocNumber('RETURN', when.getFullYear(), 6, transaction);

    // Restock WAREHOUSE-sourced lines at the exact original cost, so the
    // moving average is undone precisely rather than blended with today's.
    let returnCost = 0;
    for (const line of returnLines) {
      if (line.source !== 'WAREHOUSE' || !line.warehouse || !line.quantity) continue;
      const received = await stockService.receiveStock(
        line.product,
        line.warehouse,
        line.quantity,
        0,
        { refType: REF.SALE_RETURN, refNo: number, date: when },
        line.cost,
        transaction,
      );
      returnCost += received;
    }

    const saleReturn = await SaleReturn.create(
      {
        number,
        sale: sale.id,
        saleNumber: sale.number,
        customer: sale.customer,
        customerName: sale.customerName,
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
    await SaleReturnItem.bulkCreate(
      returnLines.map((li, position) => ({ saleReturnId: saleReturn.id, position, ...li })),
      { transaction },
    );

    sale.returnedTotal += returnTotal;
    await sale.save({ transaction });

    // Reverse revenue/tax for the returned portion, crediting the
    // customer's receivable (reduces what they owe, or grows their
    // standing credit).
    const reverseLines = [];
    if (returnNet > 0) reverseLines.push(journalService.line(ACCOUNT.SALES, { debit: returnNet }));
    if (returnTax > 0) reverseLines.push(journalService.line(ACCOUNT.TAX, { debit: returnTax }));
    if (returnTotal > 0)
      reverseLines.push(
        journalService.line(ACCOUNT.AR, { credit: returnTotal, ref: sale.customer }),
      );
    if (reverseLines.length > 0) {
      await journalService.post({
        date: when,
        description: `Return ${number} against sale ${sale.number}`,
        refType: REF.SALE_RETURN,
        refId: saleReturn.id,
        refNo: number,
        warehouse: sale.warehouse,
        store: sale.store,
        createdBy: actor ? actor.id : null,
        transaction,
        lines: reverseLines,
      });
    }

    if (returnCost > 0) {
      await journalService.post({
        date: when,
        description: `Inventory restock for return ${number}`,
        refType: REF.SALE_RETURN,
        refId: saleReturn.id,
        refNo: number,
        warehouse: sale.warehouse,
        store: sale.store,
        createdBy: actor ? actor.id : null,
        transaction,
        lines: [
          journalService.line(ACCOUNT.INVENTORY, { debit: returnCost }),
          journalService.line(ACCOUNT.COGS, { credit: returnCost }),
        ],
      });
    }

    // A gate pass per warehouse the return actually restocked — "goods
    // coming back in", documenting exactly how much of what was returned.
    saleReturn.items = returnLines;
    const { warehouseGatePasses } = await gatePassService.createGatePassesForReturn(
      saleReturn,
      sale,
      transaction,
    );
    if (warehouseGatePasses.length > 0) {
      await ReturnWarehouseGatePass.bulkCreate(
        warehouseGatePasses.map((w) => ({
          saleReturn: saleReturn.id,
          warehouse: w.warehouse,
          gatePass: w.gatePass,
        })),
        { transaction },
      );
    }

    return reloadWithAssociations(saleReturn.id, transaction);
  });
}

async function listReturnsForSale(saleId) {
  const { SaleReturn, SaleReturnItem, ReturnWarehouseGatePass } = initializeModels();
  return SaleReturn.findAll({
    where: { sale: saleId },
    include: [
      { model: SaleReturnItem, as: 'items', separate: true, order: [['position', 'ASC']] },
      { model: ReturnWarehouseGatePass, as: 'warehouseGatePasses', separate: true },
    ],
    order: [['createdAt', 'DESC']],
  });
}

// All returns across every sale — the "Sale Returns" tab's feed, so it's
// filterable the same way the Sales list is (customer, date range, and a
// free-text match on the return/sale number or the snapshotted customer name).
async function listReturns({ customer, from, to, search, ...query } = {}) {
  const { SaleReturn } = initializeModels();
  const { page, limit, skip } = parsePagination(query);
  const where = {};
  if (customer) where.customer = customer;
  if (from || to) {
    where.date = {};
    if (from) where.date[Op.gte] = new Date(from);
    if (to) where.date[Op.lte] = new Date(to);
  }
  if (search) {
    const term = `%${escapeLike(search)}%`;
    where[Op.or] = [
      { number: { [Op.iLike]: term } },
      { saleNumber: { [Op.iLike]: term } },
      { customerName: { [Op.iLike]: term } },
    ];
  }

  const { rows, count } = await SaleReturn.findAndCountAll({
    where,
    order: [
      ['date', 'DESC'],
      ['createdAt', 'DESC'],
    ],
    offset: skip,
    limit,
  });

  return { returns: rows, total: count, page, limit };
}

module.exports = { createReturn, listReturnsForSale, listReturns };
