const { Op, QueryTypes } = require('sequelize');
const { getPostgres } = require('../db/postgres');
const { initializeModels } = require('../db/models');
const ApiError = require('../utils/ApiError');
const counterService = require('./counterService');
const gatePassService = require('./gatePassService');
const { requirePositiveQuantity, normalizeQuantity } = require('../utils/quantity');
const { parsePagination, escapeLike } = require('../utils/query');
const { resolveStoreScope, storeWhere, assertStoreAccess } = require('../utils/storeScope');
const dayEndService = require('./dayEndService');

/**
 * Damaged goods are recorded on a stock receipt line (damagedQuantity) and
 * never enter warehouse stock (see stockReceiptService's header comment) —
 * this module tracks what's still sitting there awaiting pickup, and lets a
 * batch of it be handed back to the supplier as its own numbered document
 * (the purchase-side mirror of a Sale Return), complete with a gate pass for
 * the truck that takes it away.
 *
 * Deliberately no accounting entries: since damaged quantity never became
 * Inventory or a supplier payable in the first place (see
 * pendingEntityService — only the received-good quantity is ever priced), a
 * return has nothing on the ledger to reverse. This is purely a
 * physical/quantity record.
 */

// Every stock receipt line with damaged units not yet fully returned,
// scoped the same way the Stock Receiving list itself is.
async function listOutstanding({ supplier, store, warehouse, search, actor, ...query } = {}) {
  const { page, limit, skip } = parsePagination(query);
  const { storeIds } = await resolveStoreScope({ store, actor });
  if (storeIds && storeIds.length === 0) return { items: [], total: 0, page, limit };

  const conditions = ['sri.damaged_quantity > sri.returned_quantity'];
  const replacements = { limit, offset: skip };
  if (supplier) {
    conditions.push('sr.supplier_id = :supplier');
    replacements.supplier = supplier;
  }
  if (warehouse) {
    conditions.push('sr.warehouse_id = :warehouse');
    replacements.warehouse = warehouse;
  }
  if (storeIds) {
    conditions.push('sr.store_id IN (:storeIds)');
    replacements.storeIds = storeIds;
  }
  if (search) {
    conditions.push(
      '(sr.number ILIKE :term OR sr.supplier_name ILIKE :term OR sri.name ILIKE :term)',
    );
    replacements.term = `%${escapeLike(search)}%`;
  }
  const where = conditions.join(' AND ');
  const db = getPostgres();

  const [rows, countRows] = await Promise.all([
    db.query(
      `SELECT sri.id AS "itemId", sri.product_id AS "productId", sri.name,
              sri.damaged_quantity AS "damagedQuantity", sri.returned_quantity AS "returnedQuantity",
              sr.id AS "stockReceiptId", sr.number AS "receiptNumber", sr.date,
              sr.supplier_id AS "supplierId", sr.supplier_name AS "supplierName",
              sr.store_id AS "storeId", sr.warehouse_id AS "warehouseId", w.name AS "warehouseName"
       FROM stock_receipt_items sri
       JOIN stock_receipts sr ON sr.id = sri.stock_receipt_id
       LEFT JOIN warehouses w ON w.id = sr.warehouse_id
       WHERE ${where}
       ORDER BY sr.date DESC, sri.position ASC
       LIMIT :limit OFFSET :offset`,
      { replacements, type: QueryTypes.SELECT },
    ),
    db.query(
      `SELECT COUNT(*)::int AS count
       FROM stock_receipt_items sri
       JOIN stock_receipts sr ON sr.id = sri.stock_receipt_id
       WHERE ${where}`,
      { replacements, type: QueryTypes.SELECT },
    ),
  ]);

  return {
    items: rows.map((r) => ({
      ...r,
      outstandingQuantity: normalizeQuantity(r.damagedQuantity - r.returnedQuantity),
    })),
    total: countRows[0].count,
    page,
    limit,
  };
}

async function reloadWithAssociations(id, transaction) {
  const { DamagedStockReturn, DamagedStockReturnItem, Warehouse, Store, Supplier } =
    initializeModels();
  return DamagedStockReturn.findByPk(id, {
    include: [
      { model: DamagedStockReturnItem, as: 'items', separate: true, order: [['position', 'ASC']] },
      { model: Warehouse, as: 'warehouseInfo', attributes: ['id', 'name'] },
      { model: Store, as: 'storeInfo', attributes: ['id', 'name', 'code'] },
      { model: Supplier, as: 'supplierInfo', attributes: ['id', 'name', 'phone'] },
    ],
    transaction,
  });
}

async function createReturn(actor, { supplier, store, warehouse, date, truck, items, note }) {
  return getPostgres().transaction(async (transaction) => {
    const {
      DamagedStockReturn,
      DamagedStockReturnItem,
      StockReceiptItem,
      StockReceipt,
      Supplier,
      Store,
      Warehouse,
      Product,
    } = initializeModels();

    const supplierDoc = await Supplier.findByPk(supplier, { transaction });
    if (!supplierDoc) throw ApiError.notFound('Supplier not found');
    const storeDoc = await Store.findByPk(store, { transaction });
    if (!storeDoc) throw ApiError.badRequest('A store is required');
    assertStoreAccess(actor, storeDoc.id);
    if (String(supplierDoc.store) !== String(storeDoc.id)) {
      throw ApiError.notFound('Supplier not found');
    }
    const warehouseDoc = await Warehouse.findByPk(warehouse, { transaction });
    if (!warehouseDoc) throw ApiError.notFound('Warehouse not found');
    if (!Array.isArray(items) || items.length === 0) {
      throw ApiError.badRequest('At least one item is required');
    }

    const itemIds = items.map((it) => it.stockReceiptItemId);
    const receiptItems = await StockReceiptItem.findAll({
      where: { id: itemIds },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    const receiptItemsById = new Map(receiptItems.map((it) => [String(it.id), it]));

    const receiptIds = [...new Set(receiptItems.map((it) => String(it.stockReceiptId)))];
    const receipts = await StockReceipt.findAll({ where: { id: receiptIds }, transaction });
    const receiptsById = new Map(receipts.map((r) => [String(r.id), r]));

    const products = await Product.findAll({
      where: { id: receiptItems.map((it) => it.product) },
      transaction,
    });
    const productsById = new Map(products.map((p) => [String(p.id), p]));

    const lines = [];
    for (const it of items) {
      const receiptItem = receiptItemsById.get(String(it.stockReceiptItemId));
      if (!receiptItem) throw ApiError.badRequest('One of the selected items was not found');
      const receipt = receiptsById.get(String(receiptItem.stockReceiptId));
      if (!receipt || String(receipt.supplier) !== String(supplierDoc.id)) {
        throw ApiError.badRequest(`${receiptItem.name} was not received from this supplier`);
      }
      if (String(receipt.warehouse) !== String(warehouseDoc.id)) {
        throw ApiError.badRequest(`${receiptItem.name} is not held in the selected warehouse`);
      }
      const quantity = requirePositiveQuantity(it.quantity, 'Return quantity must be positive');
      const outstanding = normalizeQuantity(
        receiptItem.damagedQuantity - receiptItem.returnedQuantity,
      );
      if (quantity > outstanding) {
        throw ApiError.badRequest(
          `Cannot return ${quantity} of ${receiptItem.name} — only ${outstanding} remain outstanding`,
        );
      }
      const product = productsById.get(String(receiptItem.product));
      const unitCost = (product && product.purchasePrice) || 0;
      lines.push({
        receiptItem,
        product: receiptItem.product,
        name: receiptItem.name,
        quantity,
        unitCost,
        lineTotal: Math.round(unitCost * quantity),
      });
    }

    const when = await dayEndService.businessTimestamp(
      storeDoc.id,
      date ? new Date(date) : new Date(),
      transaction,
    );
    const number = await counterService.nextDocNumber('DSR', when.getFullYear(), 6, transaction);

    const damagedReturn = await DamagedStockReturn.create(
      {
        number,
        supplier: supplierDoc.id,
        supplierName: supplierDoc.name,
        store: storeDoc.id,
        warehouse: warehouseDoc.id,
        date: when,
        truckVehicleNumber: (truck && truck.vehicleNumber) || '',
        truckDriverName: (truck && truck.driverName) || '',
        truckDriverPhone: (truck && truck.driverPhone) || '',
        note: (note || '').trim(),
        createdBy: actor ? actor.id : null,
      },
      { transaction },
    );
    await DamagedStockReturnItem.bulkCreate(
      lines.map((li, position) => ({
        damagedStockReturnId: damagedReturn.id,
        position,
        stockReceiptItem: li.receiptItem.id,
        product: li.product,
        name: li.name,
        quantity: li.quantity,
        unitCost: li.unitCost,
        lineTotal: li.lineTotal,
      })),
      { transaction },
    );

    for (const li of lines) {
      li.receiptItem.returnedQuantity = normalizeQuantity(
        li.receiptItem.returnedQuantity + li.quantity,
      );
      await li.receiptItem.save({ transaction });
    }

    // "Goods going back out" gate pass for the truck taking the damaged
    // stock away.
    damagedReturn.items = lines.map((li) => ({
      product: li.product,
      name: li.name,
      quantity: li.quantity,
    }));
    const gatePass = await gatePassService.createForSupplierReturn(damagedReturn, transaction);
    if (gatePass) {
      damagedReturn.gatePass = gatePass.id;
      await damagedReturn.save({ transaction });
    }

    return reloadWithAssociations(damagedReturn.id, transaction);
  });
}

async function getReturn(actor, id) {
  const damagedReturn = await reloadWithAssociations(id);
  if (!damagedReturn) throw ApiError.notFound('Damaged stock return not found');
  assertStoreAccess(actor, damagedReturn.store);
  return damagedReturn;
}

async function listReturns({ supplier, store, warehouse, from, to, search, actor, ...query } = {}) {
  const { DamagedStockReturn, DamagedStockReturnItem, Warehouse, Store, Supplier } =
    initializeModels();
  const { page, limit, skip } = parsePagination(query);
  const where = {};
  if (supplier) where.supplier = supplier;
  if (warehouse) where.warehouse = warehouse;
  if (from || to) {
    where.date = {};
    if (from) where.date[Op.gte] = new Date(from);
    if (to) where.date[Op.lte] = new Date(to);
  }
  if (search) {
    const term = `%${escapeLike(search)}%`;
    where[Op.or] = [{ number: { [Op.iLike]: term } }, { supplierName: { [Op.iLike]: term } }];
  }
  const { storeIds } = await resolveStoreScope({ store, actor });
  if (storeIds) Object.assign(where, storeWhere(storeIds));

  const { rows, count } = await DamagedStockReturn.findAndCountAll({
    where,
    include: [
      { model: DamagedStockReturnItem, as: 'items', separate: true, order: [['position', 'ASC']] },
      { model: Warehouse, as: 'warehouseInfo', attributes: ['id', 'name'] },
      { model: Store, as: 'storeInfo', attributes: ['id', 'name', 'code'] },
      { model: Supplier, as: 'supplierInfo', attributes: ['id', 'name', 'phone'] },
    ],
    order: [
      ['date', 'DESC'],
      ['createdAt', 'DESC'],
    ],
    offset: skip,
    limit,
    distinct: true,
  });
  return { returns: rows, total: count, page, limit };
}

module.exports = { listOutstanding, createReturn, getReturn, listReturns };
