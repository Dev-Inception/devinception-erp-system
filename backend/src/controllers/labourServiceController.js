const labourServiceService = require('../services/labourServiceService');
const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/ApiResponse');

const mapLabourService = (s) => ({
  id: String(s._id ?? s.id),
  name: s.name,
  description: s.description || '',
});

const listLabourServices = asyncHandler(async (req, res) => {
  const entries = await labourServiceService.listLabourServices(req.user, req.query.store);
  return sendSuccess(res, 200, 'Labour services fetched', {
    labourServices: entries.map(mapLabourService),
  });
});

const getLabourService = asyncHandler(async (req, res) => {
  const entry = await labourServiceService.getLabourServiceById(req.user, req.params.id);
  return sendSuccess(res, 200, 'Labour service fetched', {
    labourService: mapLabourService(entry),
  });
});

const createLabourService = asyncHandler(async (req, res) => {
  const entry = await labourServiceService.createLabourService(req.user, req.body);
  return sendSuccess(res, 201, 'Labour service saved', {
    labourService: mapLabourService(entry),
  });
});

const updateLabourService = asyncHandler(async (req, res) => {
  const entry = await labourServiceService.updateLabourService(req.user, req.params.id, req.body);
  return sendSuccess(res, 200, 'Labour service updated', {
    labourService: mapLabourService(entry),
  });
});

const deleteLabourService = asyncHandler(async (req, res) => {
  await labourServiceService.deleteLabourService(req.user, req.params.id);
  return sendSuccess(res, 200, 'Labour service deleted');
});

module.exports = {
  listLabourServices,
  getLabourService,
  createLabourService,
  updateLabourService,
  deleteLabourService,
};
