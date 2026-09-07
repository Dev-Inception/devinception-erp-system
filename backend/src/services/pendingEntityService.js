const { Op, fn, col } = require('sequelize');
const { initializeModels } = require('../db/models');
const ApiError = require('../utils/ApiError');
const { toPaisa } = require('../utils/money');
const { ACCOUNT, REF } = require('../utils/finance');
const journalService = require('./journalService');
const { parsePagination } = require('../utils/query');
const { PendingEntity, Vendor, Supplier, Product, Store, Warehouse } = initializeModels();
const actorId = (actor) => actor && (actor.id || actor._id);
const includes = [
  { model: Vendor, as: 'vendorInfo', required: false },
  { model: Supplier, as: 'supplierInfo', required: false },
  { model: Product, as: 'productInfo', required: false },
  { model: Store, as: 'storeInfo', required: false },
  { model: Warehouse, as: 'warehouseInfo', required: false },
];
const idOf = (value) => value && (value.id || value._id || value);
async function recordSaleVendorItems(sale, lines, actor, transaction = null) {
  if (!lines?.length) return [];
  return PendingEntity.bulkCreate(
    lines.map((line) => ({
      sourceType: 'SALE_ITEM',
      sale: idOf(sale),
      sourceNo: sale.number,
      vendor: idOf(line.vendor),
      vendorName: line.vendorName,
      product: idOf(line.product),
      productName: line.name,
      quantity: line.quantity,
      store: idOf(sale.store),
      date: sale.date,
      createdBy: actorId(actor),
    })),
    { transaction },
  );
}
async function recordStockReceiptItems(receipt, lines, actor, transaction = null) {
  if (!lines?.length) return [];
  return PendingEntity.bulkCreate(
    lines.map((line) => ({
      sourceType: 'STOCK_RECEIPT_ITEM',
      stockReceipt: idOf(receipt),
      sourceNo: receipt.number,
      supplier: idOf(receipt.supplier),
      supplierName: receipt.supplierName,
      product: idOf(line.product),
      productName: line.product?.name || line.name,
      quantity: line.receivedQuantity,
      store: idOf(receipt.store),
      warehouse: idOf(receipt.warehouse),
      date: receipt.date,
      createdBy: actorId(actor),
    })),
    { transaction },
  );
}
async function listPendingEntities(query = {}) {
  const { page, limit, skip: offset } = parsePagination(query);
  const where = {};
  for (const key of ['status', 'vendor', 'supplier', 'store', 'sourceType'])
    if (query[key]) where[key] = query[key];
  if (query.search)
    where[Op.or] = ['sourceNo', 'vendorName', 'supplierName', 'productName'].map((field) => ({
      [field]: { [Op.iLike]: `%${query.search}%` },
    }));
  const { rows, count } = await PendingEntity.findAndCountAll({
    where,
    include: includes,
    order: [
      ['date', 'DESC'],
      ['createdAt', 'DESC'],
    ],
    offset,
    limit,
    distinct: true,
  });
  return { entities: rows, total: count, page, limit };
}
async function getPendingEntityById(id) {
  const row = await PendingEntity.findByPk(id, { include: includes });
  if (!row) throw ApiError.notFound('Pending entity not found');
  return row;
}
async function pricedTotalsByStockReceipt(ids) {
  const map = new Map();
  if (!ids?.length) return map;
  const rows = await PendingEntity.findAll({
    attributes: ['stockReceipt', [fn('SUM', col('line_total')), 'total']],
    where: { stockReceipt: { [Op.in]: ids }, status: 'PRICED' },
    group: ['stockReceipt'],
    raw: true,
  });
  for (const row of rows) map.set(String(row.stockReceipt), Number(row.total));
  return map;
}
async function listByStockReceipts(ids) {
  const map = new Map();
  if (!ids?.length) return map;
  const rows = await PendingEntity.findAll({ where: { stockReceipt: { [Op.in]: ids } } });
  for (const row of rows) {
    const key = String(row.stockReceipt);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(row.toJSON());
  }
  return map;
}
async function setPurchasePrice(actor, id, purchasePrice) {
  const row = await PendingEntity.findByPk(id);
  if (!row) throw ApiError.notFound('Pending entity not found');
  if (row.status === 'PRICED') throw ApiError.badRequest('This entity has already been priced');
  const price = toPaisa(purchasePrice);
  if (price <= 0) throw ApiError.badRequest('Purchase price must be positive');
  const total = Math.round(price * Number(row.quantity));
  const saleItem = row.sourceType === 'SALE_ITEM';
  await journalService.post({
    date: new Date(),
    description: saleItem
      ? `Cost for vendor item on sale ${row.sourceNo}`
      : `Supplier cost for stock receipt ${row.sourceNo}`,
    refType: REF.PENDING_ENTITY,
    refId: row.id,
    refNo: row.sourceNo,
    warehouse: row.warehouse,
    store: row.store,
    createdBy: actorId(actor),
    lines: [
      journalService.line(saleItem ? ACCOUNT.COGS : ACCOUNT.EQUITY, { debit: total }),
      journalService.line(saleItem ? ACCOUNT.AP : ACCOUNT.AP_SUPPLIER, {
        credit: total,
        ref: saleItem ? row.vendor : row.supplier,
      }),
    ],
  });
  return row.update({
    status: 'PRICED',
    purchasePrice: price,
    lineTotal: total,
    pricedBy: actorId(actor),
    pricedAt: new Date(),
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
