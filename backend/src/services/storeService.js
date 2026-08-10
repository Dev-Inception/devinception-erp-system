const Store = require('../models/storeModel');
const Warehouse = require('../models/warehouseModel');
const ApiError = require('../utils/ApiError');

/**
 * Store CRUD. Exactly one store carries isDefault=true; setting it on one
 * clears it on the others. A store only references warehouses (it doesn't
 * own data directly), so deleting one never orphans anything besides the
 * grouping itself.
 */

async function listStores() {
  return Store.find().sort({ createdAt: 1 }).populate('warehouses', 'name location');
}

async function getStoreById(id) {
  const store = await Store.findById(id).populate('warehouses', 'name location');
  if (!store) throw ApiError.notFound('Store not found');
  return store;
}

async function assertWarehousesExist(ids) {
  if (!Array.isArray(ids) || ids.length === 0) return [];
  const count = await Warehouse.countDocuments({ _id: { $in: ids } });
  if (count !== new Set(ids.map(String)).size) {
    throw ApiError.badRequest('One or more warehouses are invalid');
  }
  return ids;
}

async function createStore({ name, code, address, warehouses, isDefault, isActive }) {
  const warehouseIds = await assertWarehousesExist(warehouses);
  const store = await Store.create({
    name,
    code,
    address,
    warehouses: warehouseIds,
    isDefault: !!isDefault,
    isActive,
  });
  if (store.isDefault) {
    await Store.updateMany({ _id: { $ne: store._id } }, { isDefault: false });
  } else if ((await Store.countDocuments()) === 1) {
    // First store is always the default.
    store.isDefault = true;
    await store.save();
  }
  return getStoreById(store._id);
}

async function updateStore(id, { name, code, address, warehouses, isDefault, isActive }) {
  const store = await Store.findById(id);
  if (!store) throw ApiError.notFound('Store not found');
  if (name !== undefined) store.name = name;
  if (code !== undefined) store.code = code;
  if (address !== undefined) store.address = address;
  if (warehouses !== undefined) store.warehouses = await assertWarehousesExist(warehouses);
  if (isActive !== undefined) store.isActive = isActive;
  if (isDefault === true) {
    store.isDefault = true;
    await Store.updateMany({ _id: { $ne: store._id } }, { isDefault: false });
  }
  await store.save();
  return getStoreById(store._id);
}

async function deleteStore(id) {
  const store = await Store.findById(id);
  if (!store) throw ApiError.notFound('Store not found');
  if (store.isDefault) throw ApiError.badRequest('The default store cannot be deleted');
  await store.deleteOne();
}

module.exports = {
  listStores,
  getStoreById,
  createStore,
  updateStore,
  deleteStore,
};
