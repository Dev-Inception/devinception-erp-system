const { Op } = require('sequelize');
const { getPostgres } = require('../db/postgres');
const { initializeModels } = require('../db/models');
const ApiError = require('../utils/ApiError');

/**
 * Store CRUD. Exactly one store carries isDefault=true (also enforced by a
 * partial unique index — see migration 001); setting it on one clears it on
 * the others. Because that index would reject inserting/promoting a second
 * default row, flipping the old default off always happens first, inside the
 * same transaction as creating/promoting the new one. A store only
 * references warehouses (it doesn't own data directly), so deleting one
 * never orphans anything besides the grouping itself.
 */

const WAREHOUSE_INCLUDE = { association: 'warehouses', attributes: ['id', 'name', 'location'] };

async function listStores() {
  const { Store } = initializeModels();
  return Store.findAll({ order: [['createdAt', 'ASC']], include: [WAREHOUSE_INCLUDE] });
}

async function getStoreById(id, transaction) {
  const { Store } = initializeModels();
  const store = await Store.findByPk(id, { include: [WAREHOUSE_INCLUDE], transaction });
  if (!store) throw ApiError.notFound('Store not found');
  return store;
}

async function assertWarehousesExist(ids, transaction) {
  if (!Array.isArray(ids) || ids.length === 0) return [];
  const { Warehouse } = initializeModels();
  const count = await Warehouse.count({ where: { id: { [Op.in]: ids } }, transaction });
  if (count !== new Set(ids.map(String)).size) {
    throw ApiError.badRequest('One or more warehouses are invalid');
  }
  return ids;
}

async function createStore({ name, code, address, warehouses, isDefault, isActive }) {
  const { Store } = initializeModels();
  return getPostgres().transaction(async (transaction) => {
    const warehouseIds = await assertWarehousesExist(warehouses, transaction);
    // Clear any existing default *before* inserting the new row — the
    // partial unique index on is_default=TRUE would otherwise reject having
    // two defaults at once, even momentarily.
    if (isDefault) {
      await Store.update({ isDefault: false }, { where: {}, transaction });
    }
    const store = await Store.create(
      { name, code, address, isDefault: !!isDefault, isActive },
      { transaction },
    );
    if (warehouseIds.length) await store.setWarehouses(warehouseIds, { transaction });
    if (!store.isDefault) {
      // First store is always the default.
      const count = await Store.count({ transaction });
      if (count === 1) {
        store.isDefault = true;
        await store.save({ transaction });
      }
    }
    return getStoreById(store.id, transaction);
  });
}

async function updateStore(id, { name, code, address, warehouses, isDefault, isActive }) {
  const { Store } = initializeModels();
  return getPostgres().transaction(async (transaction) => {
    const store = await Store.findByPk(id, { transaction });
    if (!store) throw ApiError.notFound('Store not found');
    if (name !== undefined) store.name = name;
    if (code !== undefined) store.code = code;
    if (address !== undefined) store.address = address;
    if (warehouses !== undefined) {
      const warehouseIds = await assertWarehousesExist(warehouses, transaction);
      await store.setWarehouses(warehouseIds, { transaction });
    }
    if (isActive !== undefined) store.isActive = isActive;
    if (isDefault === true) {
      await Store.update(
        { isDefault: false },
        { where: { id: { [Op.ne]: store.id } }, transaction },
      );
      store.isDefault = true;
    }
    await store.save({ transaction });
    return getStoreById(store.id, transaction);
  });
}

async function deleteStore(id) {
  const { Store } = initializeModels();
  const store = await Store.findByPk(id);
  if (!store) throw ApiError.notFound('Store not found');
  if (store.isDefault) throw ApiError.badRequest('The default store cannot be deleted');
  await store.destroy();
}

module.exports = {
  listStores,
  getStoreById,
  createStore,
  updateStore,
  deleteStore,
};
