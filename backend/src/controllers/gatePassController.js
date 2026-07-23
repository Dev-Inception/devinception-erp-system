const gatePassService = require('../services/gatePassService');
const { serializeGatePass } = require('../serializers/gatePassSerializer');
const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/ApiResponse');

const listGatePasses = asyncHandler(async (req, res) => {
  const { page, limit, warehouse, status, sourceType } = req.query;
  const result = await gatePassService.listGatePasses({
    page,
    limit,
    warehouse,
    status,
    sourceType,
  });
  return sendSuccess(res, 200, 'Gate passes fetched', {
    ...result,
    gatePasses: result.gatePasses.map(serializeGatePass),
  });
});

const getGatePass = asyncHandler(async (req, res) => {
  const gatePass = await gatePassService.getGatePassById(req.params.gatePassId);
  return sendSuccess(res, 200, 'Gate pass fetched', {
    gatePass: serializeGatePass(gatePass),
  });
});

const getGatePassBySale = asyncHandler(async (req, res) => {
  const gatePass = await gatePassService.getGatePassBySale(req.params.saleId);
  return sendSuccess(res, 200, 'Gate pass fetched', {
    gatePass: serializeGatePass(gatePass),
  });
});

const getGatePassByPurchase = asyncHandler(async (req, res) => {
  const gatePass = await gatePassService.getGatePassByPurchase(req.params.purchaseId);
  return sendSuccess(res, 200, 'Gate pass fetched', {
    gatePass: serializeGatePass(gatePass),
  });
});

const downloadQr = asyncHandler(async (req, res) => {
  const { gatePass, png } = await gatePassService.generateQrPng(req.params.gatePassId);
  res.setHeader('Content-Type', 'image/png');
  res.setHeader('Content-Disposition', `inline; filename="${gatePass.number}.png"`);
  res.setHeader('Cache-Control', 'private, no-store');
  return res.status(200).send(png);
});

// The token permits a minimal product/quantity view. Processing itself is
// authenticated in the route and records the signed-in user on the pass.
const getPublicGatePass = asyncHandler(async (req, res) => {
  const gatePass = await gatePassService.getGatePassByToken(req.params.token);
  return sendSuccess(res, 200, 'Gate pass fetched', {
    gatePass: serializeGatePass(gatePass),
  });
});

const processGatePass = asyncHandler(async (req, res) => {
  const gatePass = await gatePassService.processGatePass(req.user, req.params.token, req.body);
  return sendSuccess(res, 200, 'Gate pass processed', {
    gatePass: serializeGatePass(gatePass),
  });
});

const updateProcessedGatePass = asyncHandler(async (req, res) => {
  const gatePass = await gatePassService.updateProcessedGatePass(
    req.user,
    req.params.gatePassId,
    req.body,
  );
  return sendSuccess(res, 200, 'Processed gate pass updated', {
    gatePass: serializeGatePass(gatePass),
  });
});

module.exports = {
  listGatePasses,
  getGatePass,
  getGatePassBySale,
  getGatePassByPurchase,
  downloadQr,
  getPublicGatePass,
  processGatePass,
  updateProcessedGatePass,
};
