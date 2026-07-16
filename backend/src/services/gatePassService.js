const crypto = require('crypto');
const QRCode = require('qrcode');
const GatePass = require('../models/gatePassModel');
const Sale = require('../models/saleModel');
const Customer = require('../models/customerModel');
const Product = require('../models/productModel');
const ApiError = require('../utils/ApiError');
const counterService = require('./counterService');
const { parsePagination } = require('../utils/query');

const QR_PREFIX = 'ERP_GATE_PASS:';
const SALE_FILTER = { sourceType: 'SALE' };

function refId(value) {
  return value && typeof value === 'object' && value._id ? value._id : value;
}

async function saleSnapshot(sale, suppliedCustomer = null) {
  const productIds = (sale.items || []).map((item) => refId(item.product)).filter(Boolean);
  const [products, customer] = await Promise.all([
    productIds.length
      ? Product.find({ _id: { $in: productIds } })
          .select('name sku barcode')
          .lean()
      : [],
    suppliedCustomer || (sale.customer ? Customer.findById(refId(sale.customer)).lean() : null),
  ]);
  const productsById = new Map(products.map((product) => [String(product._id), product]));

  return {
    sourceType: 'SALE',
    sale: sale._id,
    documentNumber: sale.number,
    warehouse: refId(sale.warehouse),
    saleDate: sale.date,
    customerInfo: {
      customer: customer ? customer._id : null,
      name: customer ? customer.name : sale.customerName || 'Walk-in',
      phone: customer ? customer.phone || '' : '',
      email: customer ? customer.email || '' : '',
      address: customer ? customer.address || '' : '',
    },
    items: (sale.items || []).map((item) => {
      const productId = refId(item.product);
      const product = productsById.get(String(productId));
      return {
        product: productId,
        name: item.name || (product && product.name) || 'Product',
        sku: (product && product.sku) || '',
        barcode: (product && product.barcode) || '',
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        lineTotal: item.lineTotal,
      };
    }),
    pricing: {
      subtotal: sale.subtotal,
      discount: sale.discount || 0,
      taxPercent: sale.taxPercent || 0,
      tax: sale.tax || 0,
      total: sale.total,
    },
    createdBy: refId(sale.createdBy) || null,
  };
}

function needsSnapshotRefresh(gatePass) {
  return (
    !gatePass.customerInfo ||
    !gatePass.saleDate ||
    !gatePass.pricing ||
    (gatePass.items || []).some(
      (item) => typeof item.unitPrice !== 'number' || typeof item.lineTotal !== 'number',
    )
  );
}

async function linkSale(saleId, gatePassId) {
  await Sale.updateOne({ _id: saleId }, { $set: { gatePass: gatePassId } });
}

async function createForSale(sale, customer = null) {
  const snapshot = await saleSnapshot(sale, customer);
  let gatePass = await GatePass.findOne({ ...SALE_FILTER, sale: sale._id });
  if (gatePass) {
    gatePass = await GatePass.findByIdAndUpdate(
      gatePass._id,
      { $set: snapshot },
      { returnDocument: 'after', runValidators: true },
    );
    await linkSale(sale._id, gatePass._id);
    return gatePass;
  }

  const when = sale.date ? new Date(sale.date) : new Date();
  const number = await counterService.nextDocNumber('GATE', when.getFullYear(), 6);
  try {
    gatePass = await GatePass.create({
      number,
      token: crypto.randomBytes(32).toString('hex'),
      ...snapshot,
    });
  } catch (error) {
    if (error && error.code === 11000) {
      gatePass = await GatePass.findOne({ ...SALE_FILTER, sale: sale._id });
      if (!gatePass) throw error;
    } else {
      throw error;
    }
  }

  await linkSale(sale._id, gatePass._id);
  return gatePass;
}

// Upgrade sale gate passes created by the earlier purchase/sale implementation
// so their stored snapshot also contains the new customer and product fields.
async function refreshLegacySaleGatePasses() {
  const stalePasses = await GatePass.find({
    ...SALE_FILTER,
    $or: [
      { customerInfo: { $exists: false } },
      { saleDate: { $exists: false } },
      { pricing: { $in: [null] } },
      { 'items.unitPrice': { $exists: false } },
      { 'items.lineTotal': { $exists: false } },
    ],
  }).select('sale');

  for (const stalePass of stalePasses) {
    if (!stalePass.sale) continue;
    const sale = await Sale.findById(stalePass.sale);
    if (sale) await createForSale(sale);
  }
}

async function getGatePassById(id) {
  let gatePass = await GatePass.findOne({ _id: id, ...SALE_FILTER });
  if (!gatePass) throw ApiError.notFound('Sale gate pass not found');
  if (needsSnapshotRefresh(gatePass)) {
    const sale = await Sale.findById(gatePass.sale);
    if (sale) {
      await createForSale(sale);
      gatePass = await GatePass.findById(gatePass._id);
    }
  }
  return gatePass;
}

async function getGatePassBySale(saleId) {
  const sale = await Sale.findById(saleId);
  if (!sale) throw ApiError.notFound('Sale not found');
  const gatePass = await createForSale(sale);
  return getGatePassById(gatePass._id);
}

async function listGatePasses({ warehouse, status, ...query } = {}) {
  await refreshLegacySaleGatePasses();
  const { page, limit, skip } = parsePagination(query);
  const filter = { ...SALE_FILTER };
  if (warehouse) filter.warehouse = warehouse;
  if (status) filter.status = status;

  const [gatePasses, total] = await Promise.all([
    GatePass.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
    GatePass.countDocuments(filter),
  ]);
  return { gatePasses, total, page, limit };
}

function normalizeToken(value) {
  const raw = String(value || '').trim();
  return raw.startsWith(QR_PREFIX) ? raw.slice(QR_PREFIX.length) : raw;
}

async function generateQrPng(id) {
  const gatePass = await GatePass.findOne({ _id: id, ...SALE_FILTER }).select('+token');
  if (!gatePass) throw ApiError.notFound('Sale gate pass not found');
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
    { token, status: 'ACTIVE', ...SALE_FILTER },
    { $set: { status: 'USED', scannedAt: new Date(), scannedBy: actor ? actor._id : null } },
    { returnDocument: 'after' },
  );
  if (gatePass) {
    if (needsSnapshotRefresh(gatePass)) {
      const sale = await Sale.findById(gatePass.sale);
      if (sale) {
        await createForSale(sale);
        return getGatePassById(gatePass._id);
      }
    }
    return gatePass;
  }

  const existing = await GatePass.findOne({ token, ...SALE_FILTER });
  if (!existing) throw ApiError.notFound('Invalid sale gate pass QR code');
  if (existing.status === 'USED') throw ApiError.conflict('Gate pass has already been used');
  throw ApiError.conflict('Gate pass is cancelled');
}

module.exports = {
  QR_PREFIX,
  createForSale,
  getGatePassById,
  getGatePassBySale,
  listGatePasses,
  generateQrPng,
  scanGatePass,
};
