const labourService = require('../services/labourService');
const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/ApiResponse');

const listLabour = asyncHandler(async (_req, res) => {
  const labour = await labourService.listLabour();
  return sendSuccess(res, 200, 'Labour list fetched', { labour });
});

const getLabour = asyncHandler(async (req, res) => {
  const labour = await labourService.getLabourById(req.params.id);
  return sendSuccess(res, 200, 'Labour fetched', { labour });
});

const createLabour = asyncHandler(async (req, res) => {
  const { name, phoneNumber } = req.body;
  const labour = await labourService.createLabour({ name, phoneNumber });
  return sendSuccess(res, 201, 'Labour created successfully', { labour });
});

const updateLabour = asyncHandler(async (req, res) => {
  const { name, phoneNumber } = req.body;
  const labour = await labourService.updateLabour(req.params.id, { name, phoneNumber });
  return sendSuccess(res, 200, 'Labour updated successfully', { labour });
});

const deleteLabour = asyncHandler(async (req, res) => {
  await labourService.deleteLabour(req.params.id);
  return sendSuccess(res, 200, 'Labour deleted successfully');
});

module.exports = {
  listLabour,
  getLabour,
  createLabour,
  updateLabour,
  deleteLabour,
};
