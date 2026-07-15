const crypto = require('crypto');
const QRCode = require('qrcode');
const GatePass = require('../models/gatePassModel');
const GoodsPurchase = require('../models/goodsPurchaseModel');
const Sale = require('../models/saleModel');
const ApiError = require('../utils/ApiError');
const counterService = require('./counterService');
const { parsePagination } = require('../utils/query');

const QR_PREFIX = 'ERP_GATE_PASS:';
const SOURCE = Object.freeze({ PURCHASE: 'PURCHASE', SALE: 'SALE' });

function sourceFilter(sourceType, sourceId) {
  return sourceType === SOURCE.PURCHASE ? { purchase: sourceId } : { sale: sourceId };
}

function sourceDetails(sourceType, source) {
  const isPurchase = sourceType === SOURCE.PURCHASE;
  return {
    sourceType,
    purchase: isPurchase ? source._id : null,
    sale: isPurchase ? null : source._id,
    documentNumber: source.number,
    warehouse: source.warehouse && source.warehouse._id ? source.warehouse._id : source.warehouse,
    direction: isPurchase ? 'INBOUND' : 'OUTBOUND',
    partyName: isPurchase ? source.vendorName || '' : source.customerName || 'Walk-in',
    movementDate: source.date,
    items: (source.items || []).map((item) => ({
      product: item.product && item.product._id ? item.product._id : item.product,
      name: item.name,
      quantity: item.quantity,
    })),
    createdBy: source.createdBy && source.createdBy._id ? source.createdBy._id : source.createdBy,
  };
}

async function linkSource(sourceType, sourceId, gatePassId) {
  const Model = sourceType === SOURCE.PURCHASE ? GoodsPurchase : Sale;
  await Model.updateOne({ _id: sourceId }, { $set: { gatePass: gatePassId } });
}

async function createForSource(sourceType, source) {
  if (!Object.values(SOURCE).includes(sourceType)) {
    throw ApiError.badRequest('Invalid gate pass source type');
  }

  const filter = sourceFilter(sourceType, source._id);
  let gatePass = await GatePass.findOne(filter);
  if (gatePass) {
    await linkSource(sourceType, source._id, gatePass._id);
    return gatePass;
  }

  const when = source.date ? new Date(source.date) : new Date();
  const number = await counterService.nextDocNumber('GATE', when.getFullYear(), 6);
  try {
    gatePass = await GatePass.create({
      number,
      token: crypto.randomBytes(32).toString('hex'),
      ...sourceDetails(sourceType, source),
    });
  } catch (error) {
    if (error && error.code === 11000) {
      gatePass = await GatePass.findOne(filter);
      if (!gatePass) throw error;
    } else {
      throw error;
    }
  }

  await linkSource(sourceType, source._id, gatePass._id);
  return gatePass;
}

async function createForPurchase(purchase) {
  return createForSource(SOURCE.PURCHASE, purchase);
}

async function createForSale(sale) {
  return createForSource(SOURCE.SALE, sale);
}

async function getGatePassById(id) {
  const gatePass = await GatePass.findById(id)
    .populate('warehouse', 'name location address')
    .populate('scannedBy', 'name email');
  if (!gatePass) throw ApiError.notFound('Gate pass not found');
  return gatePass;
}

async function getGatePassBySource(sourceType, sourceId) {
  if (!Object.values(SOURCE).includes(sourceType)) {
    throw ApiError.badRequest('Invalid gate pass source type');
  }

  let gatePass = await GatePass.findOne(sourceFilter(sourceType, sourceId));
  if (!gatePass) {
    const Model = sourceType === SOURCE.PURCHASE ? GoodsPurchase : Sale;
    const source = await Model.findById(sourceId);
    if (!source)
      throw ApiError.notFound(
        sourceType === SOURCE.PURCHASE ? 'Purchase not found' : 'Sale not found',
      );
    gatePass = await createForSource(sourceType, source);
  }
  return getGatePassById(gatePass._id);
}

async function listGatePasses({ sourceType, warehouse, status, ...query } = {}) {
  const { page, limit, skip } = parsePagination(query);
  const filter = {};
  if (sourceType) filter.sourceType = sourceType;
  if (warehouse) filter.warehouse = warehouse;
  if (status) filter.status = status;

  const [gatePasses, total] = await Promise.all([
    GatePass.find(filter)
      .populate('warehouse', 'name location address')
      .populate('scannedBy', 'name email')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit),
    GatePass.countDocuments(filter),
  ]);
  return { gatePasses, total, page, limit };
}

function normalizeToken(value) {
  const raw = String(value || '').trim();
  return raw.startsWith(QR_PREFIX) ? raw.slice(QR_PREFIX.length) : raw;
}

async function generateQrPng(id) {
  const gatePass = await GatePass.findById(id).select('+token');
  if (!gatePass) throw ApiError.notFound('Gate pass not found');
  const png = await QRCode.toBuffer(`${QR_PREFIX}${gatePass.token}`, {
    type: 'png',
    errorCorrectionLevel: 'M',
    margin: 2,
    width: 360,
  });
  return { gatePass, png };
}

async function scanGatePass(actor, encodedValue) {
  const token = normalizeToken(encodedValue);
  if (!token) throw ApiError.badRequest('A gate pass QR token is required');

  const gatePass = await GatePass.findOneAndUpdate(
    { token, status: 'ACTIVE' },
    { $set: { status: 'USED', scannedAt: new Date(), scannedBy: actor ? actor._id : null } },
    { returnDocument: 'after' },
  )
    .populate('warehouse', 'name location address')
    .populate('scannedBy', 'name email');
  if (gatePass) return gatePass;

  const existing = await GatePass.findOne({ token });
  if (!existing) throw ApiError.notFound('Invalid gate pass QR code');
  if (existing.status === 'USED') throw ApiError.conflict('Gate pass has already been used');
  throw ApiError.conflict('Gate pass is cancelled');
}

module.exports = {
  SOURCE,
  QR_PREFIX,
  createForPurchase,
  createForSale,
  getGatePassById,
  getGatePassBySource,
  listGatePasses,
  generateQrPng,
  scanGatePass,
};
