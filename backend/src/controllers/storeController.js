const storeService = require('../services/storeService');
const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/ApiResponse');

const listStores = asyncHandler(async (_req, res) => {
  const stores = await storeService.listStores();
  return sendSuccess(res, 200, 'Stores fetched', { stores });
});

const getStore = asyncHandler(async (req, res) => {
  const store = await storeService.getStoreById(req.params.id);
  return sendSuccess(res, 200, 'Store fetched', { store });
});

const createStore = asyncHandler(async (req, res) => {
  const store = await storeService.createStore(req.body);
  return sendSuccess(res, 201, 'Store created', { store });
});

const updateStore = asyncHandler(async (req, res) => {
  const store = await storeService.updateStore(req.params.id, req.body);
  return sendSuccess(res, 200, 'Store updated', { store });
});

const deleteStore = asyncHandler(async (req, res) => {
  await storeService.deleteStore(req.params.id);
  return sendSuccess(res, 200, 'Store deleted');
});

module.exports = {
  listStores,
  getStore,
  createStore,
  updateStore,
  deleteStore,
};
