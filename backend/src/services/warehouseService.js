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
  const where = { deletedAt: null };
  if (warehouseIds) where.id = { [Op.in]: warehouseIds };
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

// Documents that point at a warehouse. While any exist the row has to stay
// (foreign keys, and old invoices/receipts still show it).
const WAREHOUSE_DOCUMENT_TABLES = [
  'sales',
  'sale_items',
  'sale_return_items',
  'sale_warehouse_gate_passes',
  'return_warehouse_gate_passes',
  'gate_passes',
  'stock_receipts',
  'stock_movements',
  'damaged_stock_returns',
  'vendor_sales',
  'vendor_sale_returns',
];

async function warehouseHasDocuments(id, transaction) {
  const exists = WAREHOUSE_DOCUMENT_TABLES.map(
    (table) => `EXISTS (SELECT 1 FROM ${table} WHERE warehouse_id = :id)`,
  ).join(' OR ');
  const [row] = await getPostgres().query(`SELECT (${exists}) AS used`, {
    replacements: { id },
    type: QueryTypes.SELECT,
    transaction,
  });
  return !!row.used;
}

/**
 * Deletes a warehouse together with all the inventory in it — a super admin
 * or store admin only, once they've confirmed in the UI that the inventory
 * goes too. Its products are removed (productService.removeProduct) and any
 * other stock held here is written off, so the books still match. The
 * default warehouse can go as long as another one remains to take over;
 * the last warehouse can't, since sales and stock receiving need one. A
 * warehouse that documents still reference is soft-deleted rather than
 * erased, the same way products are.
 */
async function deleteWarehouse(actor, id) {
  const { Warehouse, Product, StockLevel } = initializeModels();
  const productService = require('./productService');
  if (!productService.isAdminActor(actor)) {
    throw ApiError.forbidden('Only a super admin or store admin can delete a warehouse');
  }
  await assertWarehouseAccess(actor, id);
  return getPostgres().transaction(async (transaction) => {
    const wh = await getWarehouseById(id, transaction);
    if (wh.deletedAt) throw ApiError.notFound('Warehouse not found');

    let successor = null;
    if (wh.isDefault) {
      successor = await Warehouse.findOne({
        where: { id: { [Op.ne]: wh.id }, deletedAt: null },
        order: [['createdAt', 'ASC']],
        transaction,
      });
      if (!successor) {
        throw ApiError.badRequest(
          'This is the only warehouse. Add another warehouse before deleting this one.',
        );
      }
    }

    const products = await Product.findAll({
      where: { warehouse: wh.id, deletedAt: null },
      transaction,
    });
    for (const product of products) {
      await productService.removeProduct(
        actor,
        product,
        `warehouse ${wh.name} deleted`,
        transaction,
      );
    }
    // Stock of products owned elsewhere that happens to sit here.
    const strays = await StockLevel.findAll({
      where: { warehouse: wh.id, quantity: { [Op.gt]: 0 } },
      transaction,
    });
    for (const level of strays) {
      const product = await Product.findByPk(level.product, { transaction });
      await productService.writeOffStock(
        product,
        { warehouse: wh.id, actor, reason: `warehouse ${wh.name} deleted` },
        transaction,
      );
    }

    // Clear the default flag before handing it over — the partial unique
    // index allows only one default at a time.
    if (wh.isDefault) {
      wh.isDefault = false;
      await wh.save({ transaction });
      successor.isDefault = true;
      await successor.save({ transaction });
    }

    await StockLevel.destroy({ where: { warehouse: wh.id }, transaction });
    if (await warehouseHasDocuments(wh.id, transaction)) {
      wh.deletedAt = new Date();
      wh.isActive = false;
      await wh.save({ transaction });
    } else {
      await Warehouse.destroy({ where: { id: wh.id }, transaction });
    }
  });
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
