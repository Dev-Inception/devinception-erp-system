const { UniqueConstraintError } = require('sequelize');
const { initializeModels } = require('../db/models');
const ApiError = require('../utils/ApiError');
const {
  resolveStoreScope,
  storeWhere,
  requireWriteStore,
  assertStoreAccess,
} = require('../utils/storeScope');

/**
 * Labour Services: a small catalog of billable service types (Ceiling,
 * Panel, UV Sheet, Wooden floor, ...), store-scoped like categories/units —
 * see catalogService.js, which this mirrors but doesn't share, since it
 * isn't a product classification.
 */

async function listLabourServices(actor, store) {
  const { LabourService } = initializeModels();
  const { storeIds } = await resolveStoreScope({ store, actor });
  const where = { ...storeWhere(storeIds), isActive: true };
  return LabourService.findAll({ where, order: [['name', 'ASC']] });
}

async function getLabourServiceById(actor, id) {
  const { LabourService } = initializeModels();
  const entry = await LabourService.findByPk(id);
  if (!entry) throw ApiError.notFound('Labour service not found');
  assertStoreAccess(actor, entry.store);
  return entry;
}

async function createLabourService(actor, { name, description, store } = {}) {
  const { LabourService } = initializeModels();
  const trimmedName = String(name || '').trim();
  if (!trimmedName) throw ApiError.badRequest('A name is required');
  const storeId = requireWriteStore(actor, store);
  try {
    return await LabourService.create({
      name: trimmedName,
      description: String(description || '').trim(),
      store: storeId,
    });
  } catch (err) {
    if (err instanceof UniqueConstraintError) {
      throw ApiError.badRequest('A labour service with this name already exists');
    }
    throw err;
  }
}

async function updateLabourService(actor, id, data = {}) {
  const entry = await getLabourServiceById(actor, id);
  if (data.name !== undefined) entry.name = String(data.name).trim();
  if (data.description !== undefined) entry.description = String(data.description).trim();
  try {
    await entry.save();
  } catch (err) {
    if (err instanceof UniqueConstraintError) {
      throw ApiError.badRequest('A labour service with this name already exists');
    }
    throw err;
  }
  return entry;
}

async function deleteLabourService(actor, id) {
  const entry = await getLabourServiceById(actor, id);
  await entry.destroy();
}

module.exports = {
  listLabourServices,
  getLabourServiceById,
  createLabourService,
  updateLabourService,
  deleteLabourService,
};
