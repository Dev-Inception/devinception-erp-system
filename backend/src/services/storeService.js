const { Op } = require('sequelize');
const { getPostgres } = require('../db/postgres');
const { initializeModels } = require('../db/models');
const ApiError = require('../utils/ApiError');
const { ROLES } = require('../utils/constants');
const { resolveStoreScope, assertStoreAccess } = require('../utils/storeScope');
const { assertWarehouseAccess } = require('./warehouseService');

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

// Every authenticated user needs to populate the mandatory login picker and
// header switcher, but only with the store(s) they actually belong to — a
// store-restricted actor (staff, or an ADMIN owning one or more stores) only
// ever sees their own; an unrestricted actor (super admin) sees every store.
async function listStores(actor) {
  const { Store } = initializeModels();
  const { storeIds } = await resolveStoreScope({ actor });
  // storeIds filters the Store model's own `id` here (unlike storeWhere,
  // which filters *other* models' `store` foreign key column).
  const where = storeIds ? { id: { [Op.in]: storeIds } } : {};
  return Store.findAll({
    where,
    order: [['createdAt', 'ASC']],
    include: [WAREHOUSE_INCLUDE],
  });
}

async function getStoreById(id, transaction) {
  const { Store } = initializeModels();
  const store = await Store.findByPk(id, { include: [WAREHOUSE_INCLUDE], transaction });
  if (!store) throw ApiError.notFound('Store not found');
  return store;
}

async function getStoreForActor(actor, id) {
  assertStoreAccess(actor, id);
  return getStoreById(id);
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

// A store admin manages their own store's own details (name/address/code,
// which warehouses it groups) — the same store-scoped update everything
// else in this app already grants them — but never `isDefault` (a
// platform-wide setting only super admin should touch) or another tenant's
// warehouse (each id is re-checked against the actor's own reach, since the
// list comes straight off the request body).
async function updateStore(actor, id, { name, code, address, warehouses, isDefault, isActive }) {
  const { Store } = initializeModels();
  assertStoreAccess(actor, id);
  return getPostgres().transaction(async (transaction) => {
    const store = await Store.findByPk(id, { transaction });
    if (!store) throw ApiError.notFound('Store not found');
    if (name !== undefined) store.name = name;
    if (code !== undefined) store.code = code;
    if (address !== undefined) store.address = address;
    if (warehouses !== undefined) {
      const warehouseIds = await assertWarehousesExist(warehouses, transaction);
      for (const warehouseId of warehouseIds) {
        await assertWarehouseAccess(actor, warehouseId);
      }
      await store.setWarehouses(warehouseIds, { transaction });
    }
    if (isActive !== undefined) store.isActive = isActive;
    if (isDefault === true && actor.role === ROLES.SUPER_ADMIN) {
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
  getStoreForActor,
  createStore,
  updateStore,
  deleteStore,
};
