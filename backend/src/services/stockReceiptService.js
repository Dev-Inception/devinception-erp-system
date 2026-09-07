const { Op } = require('sequelize');
const { initializeModels } = require('../db/models');
const { getPostgres } = require('../db/postgres');
const ApiError = require('../utils/ApiError');
const { ACCOUNT, REF } = require('../utils/finance');
const journalService = require('./journalService');
const stockService = require('./stockService');
const counterService = require('./counterService');
const gatePassService = require('./gatePassService');
const pendingEntityService = require('./pendingEntityService');
const paymentService = require('./paymentService');
const labourService = require('./labourService');
const { toPaisa } = require('../utils/money');
const { normalizeQuantity } = require('../utils/quantity');
const { parsePagination } = require('../utils/query');
const { actorStoreId, assertStoreAccess } = require('../utils/storeScope');
const {
  StockReceipt,
  StockReceiptItem,
  StockReceiptLabour,
  Supplier,
  Transporter,
  Warehouse,
  Store,
  Product,
} = initializeModels();
const actorId = (actor) => actor && (actor.id || actor._id);
const include = [
  { model: StockReceiptItem, as: 'items' },
  { model: StockReceiptLabour, as: 'labour' },
  { model: Transporter, as: 'transporterInfo', required: false },
];
async function load(id, transaction) {
  return StockReceipt.findByPk(id, { include, transaction });
}
async function createReceipt(actor, input) {
  const [supplier, warehouse, store, transporter] = await Promise.all([
    Supplier.findByPk(input.supplier),
    Warehouse.findByPk(input.warehouse),
    Store.findByPk(actorStoreId(actor) || input.store),
    input.transporter ? Transporter.findByPk(input.transporter) : null,
  ]);
  if (!supplier) throw ApiError.notFound('Supplier not found');
  if (!warehouse) throw ApiError.notFound('Warehouse not found');
  if (!store) throw ApiError.badRequest('A store is required');
  assertStoreAccess(actor, store.id);
  if (input.transporter && !transporter) throw ApiError.notFound('Transporter not found');
  if (!input.isOpeningStock && !input.truck?.vehicleNumber)
    throw ApiError.badRequest('Truck vehicle number is required');
  if (!input.items?.length) throw ApiError.badRequest('At least one product line is required');
  const products = await Product.findAll({
    where: { id: { [Op.in]: input.items.map((item) => item.product) } },
  });
  const byId = new Map(products.map((p) => [p.id, p]));
  const lines = input.items.map((item) => {
    const product = byId.get(String(item.product));
    if (!product) throw ApiError.badRequest(`Product ${item.product} not found`);
    const receivedQuantity = normalizeQuantity(item.receivedQuantity || 0);
    const damagedQuantity = normalizeQuantity(item.damagedQuantity || 0);
    if (receivedQuantity <= 0 && damagedQuantity <= 0)
      throw ApiError.badRequest(`${product.name}: enter a received or damaged quantity`);
    return {
      product,
      receivedQuantity,
      damagedQuantity,
      unitCost:
        input.isOpeningStock && Number(item.unitCost) > 0
          ? toPaisa(item.unitCost)
          : Number(product.purchasePrice || 0),
    };
  });
  const labour = await labourService.resolveLabourLines(input.labour || []);
  const when = input.date ? new Date(input.date) : new Date();
  const number = await counterService.nextDocNumber(
    input.isOpeningStock ? 'OPN' : 'GRN',
    when.getFullYear(),
    6,
  );
  return getPostgres().transaction(async (transaction) => {
    let stockValue = 0;
    for (const line of lines)
      if (line.receivedQuantity > 0)
        stockValue += await stockService.receiveStock(
          line.product.id,
          warehouse.id,
          line.receivedQuantity,
          line.unitCost,
          { refType: REF.PURCHASE, refNo: number, date: when },
          null,
          transaction,
        );
    const row = await StockReceipt.create(
      {
        number,
        supplier: supplier.id,
        supplierName: supplier.name,
        store: store.id,
        warehouse: warehouse.id,
        date: when,
        isOpeningStock: Boolean(input.isOpeningStock),
        truck: input.truck || {},
        transporter: transporter?.id || null,
        truckFare: toPaisa(input.truckFare || 0),
        truckFarePaidBy: input.truckFarePaidBy || 'SUPPLIER',
        truckFareMethod: input.truckFareMethod || null,
        truckFareBankAccount: input.truckFareBankAccount || null,
        labourRent: labour.reduce((sum, item) => sum + item.rent, 0),
        note: String(input.note || '').trim(),
        createdBy: actorId(actor),
      },
      { transaction },
    );
    await StockReceiptItem.bulkCreate(
      lines.map((line, position) => ({
        stockReceiptId: row.id,
        position,
        product: line.product.id,
        name: line.product.name,
        receivedQuantity: line.receivedQuantity,
        damagedQuantity: line.damagedQuantity,
      })),
      { transaction },
    );
    await StockReceiptLabour.bulkCreate(
      labour.map((item, position) => ({ ...item, stockReceiptId: row.id, position })),
      { transaction },
    );
    if (stockValue > 0)
      await journalService.post({
        date: when,
        description: `${input.isOpeningStock ? 'Opening stock' : 'Stock receipt'} ${number} from ${supplier.name}`,
        refType: REF.PURCHASE,
        refId: row.id,
        refNo: number,
        warehouse: warehouse.id,
        store: store.id,
        createdBy: actorId(actor),
        lines: [
          journalService.line(ACCOUNT.INVENTORY, { debit: stockValue }),
          journalService.line(ACCOUNT.EQUITY, { credit: stockValue }),
        ],
        transaction,
      });
    const full = await load(row.id, transaction);
    await pendingEntityService.recordStockReceiptItems(
      full,
      lines.filter((line) => line.receivedQuantity > 0),
      actor,
      transaction,
    );
    if (!input.isOpeningStock) await gatePassService.createForReceipt(full, transaction);
    return load(row.id, transaction);
  });
}
async function updateReceipt(actor, id) {
  const row = await load(id);
  if (!row) throw ApiError.notFound('Stock receipt not found');
  assertStoreAccess(actor, row.store);
  throw ApiError.conflict(
    `Stock receipt ${row.number} cannot be edited after posting; delete and recreate it before its gate pass is processed`,
  );
}
async function deleteReceipt(actor, id) {
  const row = await load(id);
  if (!row) throw ApiError.notFound('Stock receipt not found');
  assertStoreAccess(actor, row.store);
  throw ApiError.conflict(
    `Stock receipt ${row.number} cannot be deleted after posting because inventory and ledger entries are immutable`,
  );
}
async function recordPayment(actor, id, input) {
  const row = await StockReceipt.findByPk(id);
  if (!row) throw ApiError.notFound('Stock receipt not found');
  assertStoreAccess(actor, row.store);
  const amount = toPaisa(input.amount);
  if (amount <= 0) throw ApiError.badRequest('Amount must be positive');
  const totals = await pendingEntityService.pricedTotalsByStockReceipt([row.id]);
  const remaining = Math.max(0, (totals.get(row.id) || 0) - Number(row.additionalPaidAmount || 0));
  if (amount > remaining)
    throw ApiError.badRequest('Amount exceeds the remaining balance owed on this receipt');
  await paymentService.paySupplier(actor, {
    supplier: row.supplier,
    store: row.store,
    amount: input.amount,
    method: input.method,
    bankAccount: input.bankAccount,
    note: input.note,
    transaction: null,
  });
  await row.increment('additionalPaidAmount', { by: amount });
  return load(row.id);
}
async function listReceipts(args = {}) {
  const { page, limit, skip: offset } = parsePagination(args);
  const where = {};
  for (const key of ['supplier', 'transporter', 'warehouse']) if (args[key]) where[key] = args[key];
  const store = actorStoreId(args.actor) || args.store;
  if (store) where.store = store;
  if (args.from || args.to) {
    where.date = {};
    if (args.from) where.date[Op.gte] = new Date(args.from);
    if (args.to) where.date[Op.lte] = new Date(args.to);
  }
  if (args.search)
    where[Op.or] = [
      { number: { [Op.iLike]: `%${args.search}%` } },
      { supplierName: { [Op.iLike]: `%${args.search}%` } },
    ];
  const result = await StockReceipt.findAndCountAll({
    where,
    include,
    distinct: true,
    order: [
      ['date', 'DESC'],
      ['createdAt', 'DESC'],
    ],
    offset,
    limit,
  });
  return { receipts: result.rows, total: result.count, page, limit };
}
module.exports = { createReceipt, updateReceipt, deleteReceipt, listReceipts, recordPayment };
