const dayEndService = require('../services/dayEndService');
const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/ApiResponse');

const getStatus = asyncHandler(async (req, res) => {
  const { store, date } = req.query;
  const status = await dayEndService.getStatus(store, date);
  return sendSuccess(res, 200, 'Day end status fetched', status);
});

const closeDay = asyncHandler(async (req, res) => {
  const dayEnd = await dayEndService.closeDay(req.user, req.body);
  return sendSuccess(res, 200, 'Day closed', { dayEnd });
});

const reopenDay = asyncHandler(async (req, res) => {
  const dayEnd = await dayEndService.reopenDay(req.user, req.body);
  return sendSuccess(res, 200, 'Day reopened', { dayEnd });
});

module.exports = { getStatus, closeDay, reopenDay };
