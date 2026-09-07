const { Op } = require('sequelize');
const { initializeModels } = require('../db/models');
const { getPostgres } = require('../db/postgres');
const ApiError = require('../utils/ApiError');
const { Store, Warehouse } = initializeModels();
const includeWarehouses = { model: Warehouse, as: 'warehouses', through: { attributes: [] } };
async function listStores() {
  return Store.findAll({ include: [includeWarehouses], order: [['createdAt', 'ASC']] });
}
async function getStoreById(id) {
  const row = await Store.findByPk(id, { include: [includeWarehouses] });
  if (!row) throw ApiError.notFound('Store not found');
  return row;
}
async function validateWarehouses(ids = []) {
  if (!ids.length) return [];
  const unique = [...new Set(ids)];
  if ((await Warehouse.count({ where: { id: { [Op.in]: unique } } })) !== unique.length)
    throw ApiError.badRequest('One or more warehouses are invalid');
  return unique;
}
async function createStore(data) {
  const warehouses = await validateWarehouses(data.warehouses);
  return getPostgres().transaction(async (transaction) => {
    const isDefault = Boolean(data.isDefault || (await Store.count({ transaction })) === 0);
    if (isDefault) await Store.update({ isDefault: false }, { where: {}, transaction });
    const row = await Store.create({ ...data, warehouses: undefined, isDefault }, { transaction });
    await row.setWarehouses(warehouses, { transaction });
    return getStoreById(row.id);
  });
}
async function updateStore(id, data) {
  const row = await Store.findByPk(id);
  if (!row) throw ApiError.notFound('Store not found');
  const warehouses =
    data.warehouses === undefined ? null : await validateWarehouses(data.warehouses);
  return getPostgres().transaction(async (transaction) => {
    if (data.isDefault === true)
      await Store.update({ isDefault: false }, { where: { id: { [Op.ne]: id } }, transaction });
    for (const key of ['name', 'code', 'address', 'isDefault', 'isActive'])
      if (data[key] !== undefined) row[key] = data[key];
    await row.save({ transaction });
    if (warehouses) await row.setWarehouses(warehouses, { transaction });
    return getStoreById(id);
  });
}
async function deleteStore(id) {
  const row = await Store.findByPk(id);
  if (!row) throw ApiError.notFound('Store not found');
  if (row.isDefault) throw ApiError.badRequest('The default store cannot be deleted');
  await row.destroy();
}
module.exports = { listStores, getStoreById, createStore, updateStore, deleteStore };
