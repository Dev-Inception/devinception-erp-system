const vendorService = require('../services/vendorService');
const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/ApiResponse');

const listVendors = asyncHandler(async (req, res) => {
  const { page, limit, search, store } = req.query;
  const result = await vendorService.listVendors({ page, limit, search, store });
  return sendSuccess(res, 200, 'Vendors fetched', result);
});

const getVendor = asyncHandler(async (req, res) => {
  const vendor = await vendorService.getVendorById(req.params.id);
  return sendSuccess(res, 200, 'Vendor fetched', { vendor });
});

const createVendor = asyncHandler(async (req, res) => {
  const vendor = await vendorService.createVendor(req.user, req.body);
  return sendSuccess(res, 201, 'Vendor created', { vendor });
});

const updateVendor = asyncHandler(async (req, res) => {
  const vendor = await vendorService.updateVendor(req.user, req.params.id, req.body);
  return sendSuccess(res, 200, 'Vendor updated', { vendor });
});

const deleteVendor = asyncHandler(async (req, res) => {
  await vendorService.deleteVendor(req.params.id);
  return sendSuccess(res, 200, 'Vendor deleted');
});

module.exports = {
  listVendors,
  getVendor,
  createVendor,
  updateVendor,
  deleteVendor,
};
