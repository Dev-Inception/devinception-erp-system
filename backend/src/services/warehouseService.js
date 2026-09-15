const { Op, QueryTypes } = require('sequelize');
const { getPostgres } = require('../db/postgres');
const { initializeModels } = require('../db/models');
const ApiError = require('../utils/ApiError');
const { QUANTITY_DECIMALS } = require('../utils/quantity');
const { resolveWarehouseScope, requireWriteStore } = require('../utils/storeScope');

/**
 * Warehouse CRUD. Exactly one warehouse carries isDefault=true (also enforced
 * by a partial unique index — see migration 001); setting it on one clears it
 * on the others. Because that index would reject inserting a second default
 * row, flipping the old default off always happens first, inside the same
 * transaction as creating/promoting the new one.
 *
 * A warehouse only exists by way of the store(s) linked to it via
 * store_warehouses (see storeScope.js's resolveWarehouseScope) — a store-
 * restricted actor only ever sees/manages the warehouse(s) reachable from
 * their own store(s); an unrestricted actor (super admin) sees every one.
 */

async function assertWarehouseAccess(actor, warehouseId) {
  const { warehouseIds } = await resolveWarehouseScope({ actor });
  if (warehouseIds && !warehouseIds.includes(String(warehouseId))) {
    throw ApiError.forbidden('You do not have access to this warehouse');
  }
}

// Warehouses with the count of in-stock products and total stock value (paisa)
// each holds, for the Warehouses screen cards.
async function listWarehouses(actor, store) {
  const { Warehouse } = initializeModels();
  const { warehouseIds } = await resolveWarehouseScope({ actor, store });
  const where = warehouseIds ? { id: { [Op.in]: warehouseIds } } : {};
  const [warehouses, stockRows] = await Promise.all([
    Warehouse.findAll({ where, order: [['createdAt', 'ASC']] }),
    getPostgres().query(
      `SELECT warehouse_id AS warehouse, COUNT(*) AS "itemsInStock",
              COALESCE(SUM(ROUND(ROUND(quantity, ${QUANTITY_DECIMALS}) * avg_cost)), 0) AS "stockValue"
       FROM stock_levels
       WHERE ROUND(quantity, ${QUANTITY_DECIMALS}) > 0
       GROUP BY warehouse_id`,
      { type: QueryTypes.SELECT },
    ),
  ]);
  const byId = new Map(stockRows.map((s) => [String(s.warehouse), s]));
  return warehouses.map((w) => {
    const s = byId.get(w.id);
    return {
      ...w.toJSON(),
      itemsInStock: s ? s.itemsInStock : 0,
      stockValue: s ? s.stockValue : 0,
    };
  });
}

// Internal, unrestricted lookup — used by services (sales, stock receipts,
// ...) that have already established their own store/warehouse scope and
// just need the row. Controller-facing reads go through getWarehouseForActor
// below instead.
async function getWarehouseById(id, transaction) {
  const { Warehouse } = initializeModels();
  const wh = await Warehouse.findByPk(id, { transaction });
  if (!wh) throw ApiError.notFound('Warehouse not found');
  return wh;
}

async function getWarehouseForActor(actor, id) {
  const wh = await getWarehouseById(id);
  await assertWarehouseAccess(actor, wh.id);
  return wh;
}

async function createWarehouse(actor, { name, location, address, isDefault, isActive, store }) {
  const { Warehouse, StoreWarehouse } = initializeModels();
  const storeId = requireWriteStore(actor, store);
  return getPostgres().transaction(async (transaction) => {
    // Clear any existing default *before* inserting the new row — the
    // partial unique index on is_default=TRUE would otherwise reject having
    // two defaults at once, even momentarily.
    if (isDefault) {
      await Warehouse.update({ isDefault: false }, { where: {}, transaction });
    }
    const wh = await Warehouse.create(
      { name, location, address, isDefault: !!isDefault, isActive },
      { transaction },
    );
    await StoreWarehouse.create({ storeId, warehouseId: wh.id }, { transaction });
    if (!wh.isDefault) {
      // First warehouse is always the default.
      const count = await Warehouse.count({ transaction });
      if (count === 1) {
        wh.isDefault = true;
        await wh.save({ transaction });
      }
    }
    return wh;
  });
}

async function updateWarehouse(actor, id, { name, location, address, isDefault, isActive }) {
  const { Warehouse } = initializeModels();
  await assertWarehouseAccess(actor, id);
  return getPostgres().transaction(async (transaction) => {
    const wh = await Warehouse.findByPk(id, { transaction });
    if (!wh) throw ApiError.notFound('Warehouse not found');
    if (name !== undefined) wh.name = name;
    if (location !== undefined) wh.location = location;
    if (address !== undefined) wh.address = address;
    if (isActive !== undefined) wh.isActive = isActive;
    if (isDefault === true) {
      await Warehouse.update(
        { isDefault: false },
        { where: { id: { [Op.ne]: wh.id } }, transaction },
      );
      wh.isDefault = true;
    }
    await wh.save({ transaction });
    return wh;
  });
}

async function deleteWarehouse(actor, id) {
  const { Warehouse, Product, StockLevel, Sale, JournalEntry } = initializeModels();
  await assertWarehouseAccess(actor, id);
  const wh = await getWarehouseById(id);
  if (wh.isDefault) throw ApiError.badRequest('The default warehouse cannot be deleted');

  const hasProducts = await Product.count({ where: { warehouse: id } });
  if (hasProducts) {
    throw ApiError.badRequest('Warehouse still owns products and cannot be deleted');
  }

  const hasStock = await StockLevel.count({ where: { warehouse: id, quantity: { [Op.ne]: 0 } } });
  if (hasStock) throw ApiError.badRequest('Warehouse still holds stock and cannot be deleted');

  const [hasSales, hasJournalEntries] = await Promise.all([
    Sale.count({ where: { warehouse: id } }),
    JournalEntry.count({ where: { warehouse: id } }),
  ]);
  if (hasSales || hasJournalEntries) {
    throw ApiError.badRequest(
      'Warehouse has transaction history and cannot be deleted; deactivate it instead',
    );
  }

  // Drop leftover zero-quantity stock rows so no orphans linger.
  await StockLevel.destroy({ where: { warehouse: id } });
  await Warehouse.destroy({ where: { id } });
}

module.exports = {
  listWarehouses,
  getWarehouseById,
  getWarehouseForActor,
  assertWarehouseAccess,
  createWarehouse,
  updateWarehouse,
  deleteWarehouse,
};
