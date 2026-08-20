const PendingEntity = require('../models/pendingEntityModel');
const ApiError = require('../utils/ApiError');
const { toPaisa } = require('../utils/money');
const { ACCOUNT, REF } = require('../utils/finance');
const journalService = require('./journalService');
const { parsePagination, escapeRegex } = require('../utils/query');

/**
 * Tracks items procured from a vendor whose cost isn't known yet — vendor-
 * sourced sale lines and stock receipt lines — so a super admin can price
 * them later and only then does the vendor actually go payable. See
 * pendingEntityModel.js for why this exists.
 */

// One row per vendor-sourced sale line. Called only from saleService.createSale
// (not on edit — see the module's plan notes on scope).
async function recordSaleVendorItems(sale, vendorLineItems, actor) {
  if (!Array.isArray(vendorLineItems) || vendorLineItems.length === 0) return [];
  const docs = vendorLineItems.map((li) => ({
    sourceType: 'SALE_ITEM',
    sale: sale._id,
    sourceNo: sale.number,
    vendor: li.vendor,
    vendorName: li.vendorName,
    product: li.product,
    productName: li.name,
    quantity: li.quantity,
    store: sale.store,
    warehouse: null,
    date: sale.date,
    createdBy: actor ? actor._id : null,
  }));
  return PendingEntity.insertMany(docs);
}

// One row per received stock-receipt line. Called only from
// stockReceiptService.createReceipt.
async function recordStockReceiptItems(receipt, receivedLines, actor) {
  if (!Array.isArray(receivedLines) || receivedLines.length === 0) return [];
  const docs = receivedLines.map((l) => ({
    sourceType: 'STOCK_RECEIPT_ITEM',
    stockReceipt: receipt._id,
    sourceNo: receipt.number,
    vendor: receipt.vendor,
    vendorName: receipt.vendorName,
    product: l.product._id || l.product,
    productName: l.product.name || l.name,
    quantity: l.receivedQuantity,
    store: receipt.store,
    warehouse: receipt.warehouse,
    date: receipt.date,
    createdBy: actor ? actor._id : null,
  }));
  return PendingEntity.insertMany(docs);
}

async function listPendingEntities({ status, vendor, store, sourceType, search, ...query } = {}) {
  const { page, limit, skip } = parsePagination(query);
  const filter = {};
  if (status) filter.status = status;
  if (vendor) filter.vendor = vendor;
  if (store) filter.store = store;
  if (sourceType) filter.sourceType = sourceType;
  if (search) {
    const re = new RegExp(escapeRegex(search), 'i');
    filter.$or = [{ sourceNo: re }, { vendorName: re }, { productName: re }];
  }

  const [entities, total] = await Promise.all([
    PendingEntity.find(filter)
      .populate('vendor', 'name')
      .populate('product', 'name')
      .populate('store', 'name code')
      .populate('warehouse', 'name')
      .sort({ date: -1, createdAt: -1 })
      .skip(skip)
      .limit(limit),
    PendingEntity.countDocuments(filter),
  ]);

  return { entities, total, page, limit };
}

// Sum of PRICED lineTotal (paisa) per stock receipt, for many receipts at
// once — this is "amount owed to the vendor so far" for each receipt (lines
// still PENDING don't count yet). Returns Map<stockReceiptIdString, paisa>.
async function pricedTotalsByStockReceipt(stockReceiptIds) {
  const map = new Map();
  if (!Array.isArray(stockReceiptIds) || stockReceiptIds.length === 0) return map;
  const rows = await PendingEntity.aggregate([
    { $match: { stockReceipt: { $in: stockReceiptIds }, status: 'PRICED' } },
    { $group: { _id: '$stockReceipt', total: { $sum: '$lineTotal' } } },
  ]);
  for (const r of rows) map.set(String(r._id), r.total);
  return map;
}

// All pending entities for a set of stock receipts, grouped by receipt id —
// used to show each line's own price/status on the receipt (invoice, detail
// view). Returns Map<stockReceiptIdString, PendingEntity[]>.
async function listByStockReceipts(stockReceiptIds) {
  const map = new Map();
  if (!Array.isArray(stockReceiptIds) || stockReceiptIds.length === 0) return map;
  const docs = await PendingEntity.find({ stockReceipt: { $in: stockReceiptIds } }).lean();
  for (const d of docs) {
    const key = String(d.stockReceipt);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(d);
  }
  return map;
}

async function getPendingEntityById(id) {
  const entity = await PendingEntity.findById(id)
    .populate('vendor', 'name')
    .populate('product', 'name')
    .populate('store', 'name code')
    .populate('warehouse', 'name');
  if (!entity) throw ApiError.notFound('Pending entity not found');
  return entity;
}

/**
 * Prices a pending entity and posts the vendor's real payable:
 *  - SALE_ITEM: Dr COGS / Cr AP(vendor) — the cost the sale never booked,
 *    matched against revenue already recorded at checkout.
 *  - STOCK_RECEIPT_ITEM: Dr EQUITY / Cr AP(vendor) — reattributes the
 *    receipt's existing inventory funding from equity to vendor debt.
 *    Inventory value itself is untouched.
 */
async function setPurchasePrice(actor, id, purchasePrice) {
  const entity = await PendingEntity.findById(id);
  if (!entity) throw ApiError.notFound('Pending entity not found');
  if (entity.status === 'PRICED') {
    throw ApiError.badRequest('This entity has already been priced');
  }

  const price = toPaisa(purchasePrice);
  if (price <= 0) throw ApiError.badRequest('Purchase price must be positive');
  const lineTotal = Math.round(price * entity.quantity);

  const debitAccount = entity.sourceType === 'SALE_ITEM' ? ACCOUNT.COGS : ACCOUNT.EQUITY;
  const description =
    entity.sourceType === 'SALE_ITEM'
      ? `Cost for vendor item on sale ${entity.sourceNo}`
      : `Vendor cost for stock receipt ${entity.sourceNo}`;

  await journalService.post({
    date: new Date(),
    description,
    refType: REF.PENDING_ENTITY,
    refId: entity._id,
    refNo: entity.sourceNo,
    warehouse: entity.warehouse,
    store: entity.store,
    createdBy: actor ? actor._id : null,
    lines: [
      journalService.line(debitAccount, { debit: lineTotal }),
      journalService.line(ACCOUNT.AP, { credit: lineTotal, ref: entity.vendor }),
    ],
  });

  entity.status = 'PRICED';
  entity.purchasePrice = price;
  entity.lineTotal = lineTotal;
  entity.pricedBy = actor ? actor._id : null;
  entity.pricedAt = new Date();
  await entity.save();

  return entity;
}

module.exports = {
  recordSaleVendorItems,
  recordStockReceiptItems,
  listPendingEntities,
  getPendingEntityById,
  setPurchasePrice,
  pricedTotalsByStockReceipt,
  listByStockReceipts,
};
