const transporterService = require('../services/transporterService');
const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/ApiResponse');

const listTransporters = asyncHandler(async (req, res) => {
  const { page, limit, search, store } = req.query;
  const result = await transporterService.listTransporters({ page, limit, search, store });
  return sendSuccess(res, 200, 'Transporters fetched', result);
});

const getTransporter = asyncHandler(async (req, res) => {
  const transporter = await transporterService.getTransporterById(req.params.id);
  return sendSuccess(res, 200, 'Transporter fetched', { transporter });
});

const createTransporter = asyncHandler(async (req, res) => {
  const transporter = await transporterService.createTransporter(req.body);
  return sendSuccess(res, 201, 'Transporter created', { transporter });
});

const updateTransporter = asyncHandler(async (req, res) => {
  const transporter = await transporterService.updateTransporter(req.params.id, req.body);
  return sendSuccess(res, 200, 'Transporter updated', { transporter });
});

const deleteTransporter = asyncHandler(async (req, res) => {
  await transporterService.deleteTransporter(req.params.id);
  return sendSuccess(res, 200, 'Transporter deleted');
});

const chargeTransport = asyncHandler(async (req, res) => {
  const entry = await transporterService.chargeTransport(req.user, {
    ...req.body,
    transporter: req.params.id,
  });
  return sendSuccess(res, 201, 'Transport charge recorded', { refNo: entry.refNo });
});

module.exports = {
  listTransporters,
  getTransporter,
  createTransporter,
  updateTransporter,
  deleteTransporter,
  chargeTransport,
};
