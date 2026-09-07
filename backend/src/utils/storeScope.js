const { Op } = require('sequelize');
const { initializeModels } = require('../db/models');
const { isValidId } = require('../db/id');
const ApiError = require('./ApiError');
const { Store, Warehouse } = initializeModels();
function actorStoreId(actor) {
  const value = actor && actor.store;
  return value ? String(value.id || value._id || value) : null;
}
function assertStoreAccess(actor, storeId) {
  const restricted = actorStoreId(actor);
  if (restricted && String(storeId) !== restricted)
    throw ApiError.forbidden('You do not have access to this store');
}
async function resolveWarehouseScope({ store, warehouse, actor } = {}) {
  const restricted = actorStoreId(actor);
  const effectiveStore = restricted || store;
  if (effectiveStore && isValidId(String(effectiveStore))) {
    const row = await Store.findByPk(effectiveStore, {
      include: [
        { model: Warehouse, as: 'warehouses', through: { attributes: [] }, attributes: ['id'] },
      ],
    });
    if (!row) throw ApiError.notFound('Store not found');
    const ids = row.warehouses.map(({ id }) => String(id));
    if (warehouse && isValidId(String(warehouse)) && ids.includes(String(warehouse)))
      return { warehouseIds: [String(warehouse)] };
    return { warehouseIds: ids };
  }
  if (!restricted && warehouse && isValidId(String(warehouse)))
    return { warehouseIds: [String(warehouse)] };
  return { warehouseIds: restricted ? [] : null };
}
function warehouseWhere(warehouseIds) {
  if (!warehouseIds) return {};
  return { warehouse: warehouseIds.length === 1 ? warehouseIds[0] : { [Op.in]: warehouseIds } };
}
module.exports = {
  resolveWarehouseScope,
  warehouseWhere,
  warehouseMongoFilter: warehouseWhere,
  actorStoreId,
  assertStoreAccess,
};
