const supplierService = require('../services/supplierService');
const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/ApiResponse');

const listSuppliers = asyncHandler(async (req, res) => {
  const { page, limit, search, store } = req.query;
  const result = await supplierService.listSuppliers({ page, limit, search, store });
  return sendSuccess(res, 200, 'Suppliers fetched', result);
});

const getSupplier = asyncHandler(async (req, res) => {
  const supplier = await supplierService.getSupplierById(req.params.id);
  return sendSuccess(res, 200, 'Supplier fetched', { supplier });
});

const createSupplier = asyncHandler(async (req, res) => {
  const supplier = await supplierService.createSupplier(req.body);
  return sendSuccess(res, 201, 'Supplier created', { supplier });
});

const updateSupplier = asyncHandler(async (req, res) => {
  const supplier = await supplierService.updateSupplier(req.params.id, req.body);
  return sendSuccess(res, 200, 'Supplier updated', { supplier });
});

const deleteSupplier = asyncHandler(async (req, res) => {
  await supplierService.deleteSupplier(req.params.id);
  return sendSuccess(res, 200, 'Supplier deleted');
});

module.exports = {
  listSuppliers,
  getSupplier,
  createSupplier,
  updateSupplier,
  deleteSupplier,
};
