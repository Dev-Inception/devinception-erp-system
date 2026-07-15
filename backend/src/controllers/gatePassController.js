const gatePassService = require('../services/gatePassService');
const { serializeGatePass } = require('../serializers/gatePassSerializer');
const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/ApiResponse');

const listGatePasses = asyncHandler(async (req, res) => {
  const { page, limit, sourceType, warehouse, status } = req.query;
  const result = await gatePassService.listGatePasses({
    page,
    limit,
    sourceType,
    warehouse,
    status,
  });
  return sendSuccess(res, 200, 'Gate passes fetched', {
    ...result,
    gatePasses: result.gatePasses.map(serializeGatePass),
  });
});

const getGatePass = asyncHandler(async (req, res) => {
  const gatePass = await gatePassService.getGatePassById(req.params.id);
  return sendSuccess(res, 200, 'Gate pass fetched', {
    gatePass: serializeGatePass(gatePass),
  });
});

const getGatePassBySource = asyncHandler(async (req, res) => {
  const gatePass = await gatePassService.getGatePassBySource(
    req.params.sourceType.toUpperCase(),
    req.params.sourceId,
  );
  return sendSuccess(res, 200, 'Gate pass fetched', {
    gatePass: serializeGatePass(gatePass),
  });
});

const downloadQr = asyncHandler(async (req, res) => {
  const { gatePass, png } = await gatePassService.generateQrPng(req.params.id);
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

module.exports = {
  listGatePasses,
  getGatePass,
  getGatePassBySource,
  downloadQr,
  scanGatePass,
};
