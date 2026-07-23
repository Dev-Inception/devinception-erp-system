const gatePassService = require('../services/gatePassService');
const { serializeGatePass } = require('../serializers/gatePassSerializer');
const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/ApiResponse');

const listGatePasses = asyncHandler(async (req, res) => {
  const { page, limit, warehouse, status } = req.query;
  const result = await gatePassService.listGatePasses({
    page,
    limit,
    warehouse,
    status,
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

const scanGatePass = asyncHandler(async (req, res) => {
  const gatePass = await gatePassService.scanGatePass(req.user, req.body.token);
  return sendSuccess(res, 200, 'Gate pass verified and marked as used', {
    gatePass: serializeGatePass(gatePass),
  });
});

// Public, unauthenticated counterparts used by the gate-side scan page. The
// token in the URL is the credential (see gatePassPublicRoutes.js) — no `protect`.
const getPublicGatePass = asyncHandler(async (req, res) => {
  const gatePass = await gatePassService.getGatePassByToken(req.params.token);
  return sendSuccess(res, 200, 'Gate pass fetched', {
    gatePass: serializeGatePass(gatePass),
  });
});

const scanPublicGatePass = asyncHandler(async (req, res) => {
  const gatePass = await gatePassService.scanGatePass(null, req.params.token);
  return sendSuccess(res, 200, 'Gate pass verified and marked as used', {
    gatePass: serializeGatePass(gatePass),
  });
});

module.exports = {
  listGatePasses,
  getGatePass,
  getGatePassBySale,
  getGatePassByPurchase,
  downloadQr,
  scanGatePass,
  getPublicGatePass,
  scanPublicGatePass,
};
