const { Op, QueryTypes } = require('sequelize');
const { getPostgres } = require('../db/postgres');
const { initializeModels } = require('../db/models');
const ApiError = require('../utils/ApiError');
const { toPaisa } = require('../utils/money');
const { ACCOUNT, REF } = require('../utils/finance');
const journalService = require('./journalService');
const { parsePagination, escapeLike } = require('../utils/query');

/**
 * Tracks items procured from a vendor/supplier whose cost isn't known yet —
 * vendor-sourced sale lines and stock receipt lines — so a super admin can
 * price them later and only then does the party actually go payable. See
 * db/models/pendingEntityModel.js for why this exists.
 */

// One row per vendor-sourced sale line. Called only from saleService.createSale
// (not on edit — see the module's plan notes on scope). Must run inside the
// caller's transaction (part of the atomic sale creation).
async function recordSaleVendorItems(sale, vendorLineItems, actor, transaction) {
  if (!Array.isArray(vendorLineItems) || vendorLineItems.length === 0) return [];
  const { PendingEntity } = initializeModels();
  const docs = vendorLineItems.map((li) => ({
    sourceType: 'SALE_ITEM',
    sale: sale.id,
    sourceNo: sale.number,
    vendor: li.vendor,
    vendorName: li.vendorName,
    product: li.product,
    productName: li.name,
    quantity: li.quantity,
    store: sale.store,
    warehouse: null,
    date: sale.date,
    createdBy: actor ? actor.id : null,
  }));
  return PendingEntity.bulkCreate(docs, { transaction });
}

// One row per received stock-receipt line. Called only from
// stockReceiptService.createReceipt. Must run inside the caller's transaction.
async function recordStockReceiptItems(receipt, receivedLines, actor, transaction) {
  if (!Array.isArray(receivedLines) || receivedLines.length === 0) return [];
  const { PendingEntity } = initializeModels();
  const docs = receivedLines.map((l) => ({
    sourceType: 'STOCK_RECEIPT_ITEM',
    stockReceipt: receipt.id,
    sourceNo: receipt.number,
    supplier: receipt.supplier,
    supplierName: receipt.supplierName,
    product: l.product.id || l.product,
    productName: l.product.name || l.name,
    quantity: l.receivedQuantity,
    store: receipt.store,
    warehouse: receipt.warehouse,
    date: receipt.date,
    createdBy: actor ? actor.id : null,
  }));
  return PendingEntity.bulkCreate(docs, { transaction });
}

async function listPendingEntities({
  status,
  vendor,
  supplier,
  store,
  sourceType,
  search,
  ...query
} = {}) {
  const { PendingEntity, Vendor, Supplier, Product, Store, Warehouse } = initializeModels();
  const { page, limit, skip } = parsePagination(query);
  const where = {};
  if (status) where.status = status;
  if (vendor) where.vendor = vendor;
  if (supplier) where.supplier = supplier;
  if (store) where.store = store;
  if (sourceType) where.sourceType = sourceType;
  if (search) {
    const term = `%${escapeLike(search)}%`;
    where[Op.or] = [
      { sourceNo: { [Op.iLike]: term } },
      { vendorName: { [Op.iLike]: term } },
      { supplierName: { [Op.iLike]: term } },
      { productName: { [Op.iLike]: term } },
    ];
  }

  const { rows, count } = await PendingEntity.findAndCountAll({
    where,
    include: [
      { model: Vendor, as: 'vendorInfo', attributes: ['id', 'name'] },
      { model: Supplier, as: 'supplierInfo', attributes: ['id', 'name'] },
      { model: Product, as: 'productInfo', attributes: ['id', 'name'] },
      { model: Store, as: 'storeInfo', attributes: ['id', 'name', 'code'] },
      { model: Warehouse, as: 'warehouseInfo', attributes: ['id', 'name'] },
    ],
    order: [
      ['date', 'DESC'],
      ['createdAt', 'DESC'],
    ],
    offset: skip,
    limit,
  });

  return { entities: rows, total: count, page, limit };
}

// Sum of PRICED lineTotal (paisa) per stock receipt, for many receipts at
// once — this is "amount owed to the vendor so far" for each receipt (lines
// still PENDING don't count yet). Returns Map<stockReceiptIdString, paisa>.
async function pricedTotalsByStockReceipt(stockReceiptIds, transaction) {
  const map = new Map();
  if (!Array.isArray(stockReceiptIds) || stockReceiptIds.length === 0) return map;
  const rows = await getPostgres().query(
    `SELECT stock_receipt_id AS "stockReceipt", COALESCE(SUM(line_total), 0) AS total
     FROM pending_entities
     WHERE stock_receipt_id IN (:ids) AND status = 'PRICED'
     GROUP BY stock_receipt_id`,
    { replacements: { ids: stockReceiptIds }, transaction, type: QueryTypes.SELECT },
  );
  for (const r of rows) map.set(String(r.stockReceipt), r.total);
  return map;
}

// All pending entities for a set of stock receipts, grouped by receipt id —
// used to show each line's own price/status on the receipt (invoice, detail
// view). Returns Map<stockReceiptIdString, PendingEntity[]>.
async function listByStockReceipts(stockReceiptIds, transaction) {
  const map = new Map();
  if (!Array.isArray(stockReceiptIds) || stockReceiptIds.length === 0) return map;
  const { PendingEntity } = initializeModels();
  const docs = await PendingEntity.findAll({
    where: { stockReceipt: { [Op.in]: stockReceiptIds } },
    transaction,
  });
  for (const d of docs) {
    const key = String(d.stockReceipt);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(d.toJSON());
  }
  return map;
}

async function getPendingEntityById(id) {
  const { PendingEntity, Vendor, Supplier, Product, Store, Warehouse } = initializeModels();
  const entity = await PendingEntity.findByPk(id, {
    include: [
      { model: Vendor, as: 'vendorInfo', attributes: ['id', 'name'] },
      { model: Supplier, as: 'supplierInfo', attributes: ['id', 'name'] },
      { model: Product, as: 'productInfo', attributes: ['id', 'name'] },
      { model: Store, as: 'storeInfo', attributes: ['id', 'name', 'code'] },
      { model: Warehouse, as: 'warehouseInfo', attributes: ['id', 'name'] },
    ],
  });
  if (!entity) throw ApiError.notFound('Pending entity not found');
  return entity;
}

/**
 * Prices a pending entity and posts the real payable:
 *  - SALE_ITEM: Dr COGS / Cr AP(vendor) — the cost the sale never booked,
 *    matched against revenue already recorded at checkout.
 *  - STOCK_RECEIPT_ITEM: Dr EQUITY / Cr AP_SUPPLIER(supplier) — reattributes
 *    the receipt's existing inventory funding from equity to supplier debt.
 *    Inventory value itself is untouched.
 */
async function setPurchasePrice(actor, id, purchasePrice) {
  const { PendingEntity } = initializeModels();
  return getPostgres().transaction(async (transaction) => {
    const entity = await PendingEntity.findByPk(id, { transaction, lock: transaction.LOCK.UPDATE });
    if (!entity) throw ApiError.notFound('Pending entity not found');
    if (entity.status === 'PRICED') {
      throw ApiError.badRequest('This entity has already been priced');
    }

    const price = toPaisa(purchasePrice);
    if (price <= 0) throw ApiError.badRequest('Purchase price must be positive');
    const lineTotal = Math.round(price * entity.quantity);

    const isSaleItem = entity.sourceType === 'SALE_ITEM';
    const debitAccount = isSaleItem ? ACCOUNT.COGS : ACCOUNT.EQUITY;
    const description = isSaleItem
      ? `Cost for vendor item on sale ${entity.sourceNo}`
      : `Supplier cost for stock receipt ${entity.sourceNo}`;
    const payableLine = isSaleItem
      ? journalService.line(ACCOUNT.AP, { credit: lineTotal, ref: entity.vendor })
      : journalService.line(ACCOUNT.AP_SUPPLIER, { credit: lineTotal, ref: entity.supplier });

    await journalService.post({
      date: new Date(),
      description,
      refType: REF.PENDING_ENTITY,
      refId: entity.id,
      refNo: entity.sourceNo,
      warehouse: entity.warehouse,
      store: entity.store,
      createdBy: actor ? actor.id : null,
      transaction,
      lines: [journalService.line(debitAccount, { debit: lineTotal }), payableLine],
    });

    entity.status = 'PRICED';
    entity.purchasePrice = price;
    entity.lineTotal = lineTotal;
    entity.pricedBy = actor ? actor.id : null;
    entity.pricedAt = new Date();
    await entity.save({ transaction });

    return entity;
  });
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
