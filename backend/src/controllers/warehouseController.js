const warehouseService = require('../services/warehouseService');
const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/ApiResponse');
const { view } = require('../utils/money');

const listWarehouses = asyncHandler(async (_req, res) => {
  const warehouses = await warehouseService.listWarehouses();
  return sendSuccess(res, 200, 'Warehouses fetched', {
    warehouses: warehouses.map((w) => view(w, ['stockValue'])),
  });
});

const getWarehouse = asyncHandler(async (req, res) => {
  const warehouse = await warehouseService.getWarehouseById(req.params.id);
  return sendSuccess(res, 200, 'Warehouse fetched', { warehouse });
});

const createWarehouse = asyncHandler(async (req, res) => {
  const warehouse = await warehouseService.createWarehouse(req.body);
  return sendSuccess(res, 201, 'Warehouse created', { warehouse });
});

const updateWarehouse = asyncHandler(async (req, res) => {
  const warehouse = await warehouseService.updateWarehouse(req.params.id, req.body);
  return sendSuccess(res, 200, 'Warehouse updated', { warehouse });
});

const deleteWarehouse = asyncHandler(async (req, res) => {
  await warehouseService.deleteWarehouse(req.params.id);
  return sendSuccess(res, 200, 'Warehouse deleted');
});

module.exports = {
  listWarehouses,
  getWarehouse,
  createWarehouse,
  updateWarehouse,
  deleteWarehouse,
};
