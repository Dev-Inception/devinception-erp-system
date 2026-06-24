const customerService = require("../services/customerService");
const asyncHandler = require("../utils/asyncHandler");
const { sendSuccess } = require("../utils/ApiResponse");

const listCustomers = asyncHandler(async (req, res) => {
  const { page, limit, search } = req.query;
  const result = await customerService.listCustomers({ page, limit, search });
  return sendSuccess(res, 200, "Customers fetched", result);
});

const getCustomer = asyncHandler(async (req, res) => {
  const customer = await customerService.getCustomerById(req.params.id);
  return sendSuccess(res, 200, "Customer fetched", { customer });
});

const createCustomer = asyncHandler(async (req, res) => {
  const customer = await customerService.createCustomer(req.body);
  return sendSuccess(res, 201, "Customer created", { customer });
});

const updateCustomer = asyncHandler(async (req, res) => {
  const customer = await customerService.updateCustomer(req.params.id, req.body);
  return sendSuccess(res, 200, "Customer updated", { customer });
});

const deleteCustomer = asyncHandler(async (req, res) => {
  await customerService.deleteCustomer(req.params.id);
  return sendSuccess(res, 200, "Customer deleted");
});

module.exports = {
  listCustomers,
  getCustomer,
  createCustomer,
  updateCustomer,
  deleteCustomer,
};
