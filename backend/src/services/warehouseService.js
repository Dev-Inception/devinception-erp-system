const { Op, QueryTypes } = require('sequelize');
const { getPostgres } = require('../db/postgres');
const { initializeModels } = require('../db/models');
const ApiError = require('../utils/ApiError');
const { QUANTITY_DECIMALS } = require('../utils/quantity');

/**
 * Warehouse CRUD. Exactly one warehouse carries isDefault=true (also enforced
 * by a partial unique index — see migration 001); setting it on one clears it
 * on the others. Because that index would reject inserting a second default
 * row, flipping the old default off always happens first, inside the same
 * transaction as creating/promoting the new one.
 */

// Warehouses with the count of in-stock products and total stock value (paisa)
// each holds, for the Warehouses screen cards.
async function listWarehouses() {
  const { Warehouse } = initializeModels();
  const [warehouses, stockRows] = await Promise.all([
    Warehouse.findAll({ order: [['createdAt', 'ASC']] }),
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

async function getWarehouseById(id, transaction) {
  const { Warehouse } = initializeModels();
  const wh = await Warehouse.findByPk(id, { transaction });
  if (!wh) throw ApiError.notFound('Warehouse not found');
  return wh;
}

async function createWarehouse({ name, location, address, isDefault, isActive }) {
  const { Warehouse } = initializeModels();
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

async function updateWarehouse(id, { name, location, address, isDefault, isActive }) {
  const { Warehouse } = initializeModels();
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

async function deleteWarehouse(id) {
  const { Warehouse, Product, StockLevel, Sale, JournalEntry } = initializeModels();
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
  createWarehouse,
  updateWarehouse,
  deleteWarehouse,
};
