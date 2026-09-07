const { Op, QueryTypes } = require('sequelize');
const { initializeModels } = require('../db/models');
const { getPostgres } = require('../db/postgres');
const ApiError = require('../utils/ApiError');
const { Warehouse, Product, StockLevel, Sale, GoodsPurchase, JournalEntry } = initializeModels();

/**
 * Warehouse CRUD. Exactly one warehouse carries isDefault=true; setting it on
 * one clears it on the others.
 */

// Warehouses with the count of in-stock products and total stock value (paisa)
// each holds, for the Warehouses screen cards.
async function listWarehouses() {
  const [warehouses, stock] = await Promise.all([
    Warehouse.findAll({ order: [['createdAt', 'ASC']] }),
    getPostgres().query(
      `SELECT warehouse_id,
              COUNT(*)::integer AS "itemsInStock",
              COALESCE(SUM(ROUND(ROUND(quantity, 6) * avg_cost)), 0) AS "stockValue"
         FROM stock_levels
        WHERE ROUND(quantity, 6) > 0
        GROUP BY warehouse_id`,
      { type: QueryTypes.SELECT },
    ),
  ]);
  const byId = new Map(stock.map((s) => [String(s.warehouse_id), s]));
  return warehouses.map((w) => {
    const s = byId.get(String(w.id));
    return {
      ...w.toJSON(),
      itemsInStock: s ? Number(s.itemsInStock) : 0,
      stockValue: s ? Number(s.stockValue) : 0,
    };
  });
}

async function getWarehouseById(id) {
  const wh = await Warehouse.findByPk(id);
  if (!wh) throw ApiError.notFound('Warehouse not found');
  return wh;
}

async function createWarehouse({ name, location, address, isDefault, isActive }) {
  return getPostgres().transaction(async (transaction) => {
    const count = await Warehouse.count({ transaction });
    const makeDefault = !!isDefault || count === 0;
    if (makeDefault) {
      await Warehouse.update({ isDefault: false }, { where: {}, transaction });
    }
    return Warehouse.create(
      { name, location, address, isDefault: makeDefault, isActive },
      { transaction },
    );
  });
}

async function updateWarehouse(id, { name, location, address, isDefault, isActive }) {
  const wh = await getWarehouseById(id);
  if (name !== undefined) wh.name = name;
  if (location !== undefined) wh.location = location;
  if (address !== undefined) wh.address = address;
  if (isActive !== undefined) wh.isActive = isActive;
  return getPostgres().transaction(async (transaction) => {
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
  const wh = await getWarehouseById(id);
  if (wh.isDefault) throw ApiError.badRequest('The default warehouse cannot be deleted');

  const hasProducts = await Product.count({ where: { warehouse: id } });
  if (hasProducts) {
    throw ApiError.badRequest('Warehouse still owns products and cannot be deleted');
  }

  const hasStock = await StockLevel.count({
    where: { warehouse: id, quantity: { [Op.ne]: 0 } },
  });
  if (hasStock) throw ApiError.badRequest('Warehouse still holds stock and cannot be deleted');

  const history = await Promise.all([
    Sale.count({ where: { warehouse: id } }),
    GoodsPurchase.count({ where: { warehouse: id } }),
    JournalEntry.count({ where: { warehouse: id } }),
  ]);
  if (history.some(Boolean)) {
    throw ApiError.badRequest(
      'Warehouse has transaction history and cannot be deleted; deactivate it instead',
    );
  }

  // Drop leftover zero-quantity stock rows so no orphans linger.
  await StockLevel.destroy({ where: { warehouse: id } });
  await wh.destroy();
}

module.exports = {
  listWarehouses,
  getWarehouseById,
  createWarehouse,
  updateWarehouse,
  deleteWarehouse,
};
