const Sale = require('../models/saleModel');
const SaleReturn = require('../models/saleReturnModel');
const ApiError = require('../utils/ApiError');
const { ACCOUNT, REF } = require('../utils/finance');
const journalService = require('./journalService');
const stockService = require('./stockService');
const counterService = require('./counterService');
const { requirePositiveQuantity, normalizeQuantity } = require('../utils/quantity');
const { parsePagination, escapeRegex } = require('../utils/query');

/**
 * Product returns against a completed sale. Each return is its own numbered
 * document, restocks WAREHOUSE-sourced lines (at the exact cost they were
 * issued at) back into their original warehouse, and posts reversing journal
 * entries for revenue/tax/COGS — the standard append-only correction pattern.
 *
 * Requires the sale to have a customer: the reversed revenue/tax needs a
 * balancing credit, and here that's always Accounts Receivable for that
 * customer (reducing what they owe, or increasing their standing credit if
 * the sale carried no balance) rather than a cash refund out the drawer.
 */

async function createReturn(actor, saleId, { items, note }) {
  const sale = await Sale.findById(saleId);
  if (!sale) throw ApiError.notFound('Sale not found');
  if (!sale.customer) {
    throw ApiError.badRequest('Returns require the sale to have a customer on file');
  }
  if (!Array.isArray(items) || items.length === 0) {
    throw ApiError.badRequest('At least one returned item is required');
  }

  // Quantities already returned in prior (partial) returns against this sale,
  // per product — a line can't be over-returned across multiple visits.
  const priorReturns = await SaleReturn.find({ sale: sale._id }).select('items').lean();
  const alreadyReturnedByProduct = new Map();
  for (const r of priorReturns) {
    for (const it of r.items) {
      const key = String(it.product);
      alreadyReturnedByProduct.set(key, (alreadyReturnedByProduct.get(key) || 0) + it.quantity);
    }
  }

  const saleItemsByProduct = new Map(sale.items.map((it) => [String(it.product), it]));

  const returnLines = [];
  let returnSubtotal = 0;
  for (const it of items) {
    const originalLine = saleItemsByProduct.get(String(it.product));
    if (!originalLine) throw ApiError.badRequest(`Product ${it.product} was not part of this sale`);
    const quantity = requirePositiveQuantity(it.quantity, 'Return quantity must be positive');
    const alreadyReturned = alreadyReturnedByProduct.get(String(it.product)) || 0;
    const availableToReturn = normalizeQuantity(originalLine.quantity - alreadyReturned);
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

  // Apportion the original sale's discount/tax onto this return, proportional
  // to how much of the sale's subtotal it represents — mirrors how
  // calculateInvoiceTotals applies a single order-level discount before tax.
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
  const number = await counterService.nextDocNumber('RETURN', when.getFullYear(), 6);

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
    );
    returnCost += received;
  }

  const saleReturn = await SaleReturn.create({
    number,
    sale: sale._id,
    saleNumber: sale.number,
    customer: sale.customer,
    customerName: sale.customerName,
    date: when,
    items: returnLines,
    subtotal: returnSubtotal,
    discount: returnDiscount,
    tax: returnTax,
    total: returnTotal,
    cost: returnCost,
    note: (note || '').trim(),
    createdBy: actor ? actor._id : null,
  });

  sale.returnedTotal += returnTotal;
  await sale.save();

  // Reverse revenue/tax for the returned portion, crediting the customer's
  // receivable (reduces what they owe, or grows their standing credit).
  const reverseLines = [];
  if (returnNet > 0) reverseLines.push(journalService.line(ACCOUNT.SALES, { debit: returnNet }));
  if (returnTax > 0) reverseLines.push(journalService.line(ACCOUNT.TAX, { debit: returnTax }));
  if (returnTotal > 0)
    reverseLines.push(journalService.line(ACCOUNT.AR, { credit: returnTotal, ref: sale.customer }));
  if (reverseLines.length > 0) {
    await journalService.post({
      date: when,
      description: `Return ${number} against sale ${sale.number}`,
      refType: REF.SALE_RETURN,
      refId: saleReturn._id,
      refNo: number,
      warehouse: sale.warehouse,
      store: sale.store,
      createdBy: actor ? actor._id : null,
      lines: reverseLines,
    });
  }

  if (returnCost > 0) {
    await journalService.post({
      date: when,
      description: `Inventory restock for return ${number}`,
      refType: REF.SALE_RETURN,
      refId: saleReturn._id,
      refNo: number,
      warehouse: sale.warehouse,
      store: sale.store,
      createdBy: actor ? actor._id : null,
      lines: [
        journalService.line(ACCOUNT.INVENTORY, { debit: returnCost }),
        journalService.line(ACCOUNT.COGS, { credit: returnCost }),
      ],
    });
  }

  return saleReturn;
}

async function listReturnsForSale(saleId) {
  return SaleReturn.find({ sale: saleId }).sort({ createdAt: -1 });
}

// All returns across every sale — the "Sale Returns" tab's feed, so it's
// filterable the same way the Sales list is (customer, date range, and a
// free-text match on the return/sale number or the snapshotted customer name).
async function listReturns({ customer, from, to, search, ...query } = {}) {
  const { page, limit, skip } = parsePagination(query);
  const filter = {};
  if (customer) filter.customer = customer;
  if (from || to) {
    filter.date = {};
    if (from) filter.date.$gte = new Date(from);
    if (to) filter.date.$lte = new Date(to);
  }
  if (search) {
    const re = new RegExp(escapeRegex(search), 'i');
    filter.$or = [{ number: re }, { saleNumber: re }, { customerName: re }];
  }

  const [returns, total] = await Promise.all([
    SaleReturn.find(filter).sort({ date: -1, createdAt: -1 }).skip(skip).limit(limit),
    SaleReturn.countDocuments(filter),
  ]);

  return { returns, total, page, limit };
}

module.exports = { createReturn, listReturnsForSale, listReturns };
