const crypto = require('crypto');
const QRCode = require('qrcode');
const GatePass = require('../models/gatePassModel');
const Sale = require('../models/saleModel');
const GoodsPurchase = require('../models/goodsPurchaseModel');
const Customer = require('../models/customerModel');
const Vendor = require('../models/vendorModel');
const Product = require('../models/productModel');
const ApiError = require('../utils/ApiError');
const counterService = require('./counterService');
const { parsePagination } = require('../utils/query');

const QR_PREFIX = 'ERP_GATE_PASS:';
const SALE_FILTER = { sourceType: 'SALE' };
const PURCHASE_FILTER = { sourceType: 'PURCHASE' };

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
    (gatePass.sourceType === 'PURCHASE'
      ? !gatePass.vendorInfo || !gatePass.purchaseDate
      : !gatePass.customerInfo || !gatePass.saleDate) ||
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

async function purchaseSnapshot(purchase, suppliedVendor = null) {
  const productIds = (purchase.items || []).map((item) => refId(item.product)).filter(Boolean);
  const [products, vendor] = await Promise.all([
    productIds.length
      ? Product.find({ _id: { $in: productIds } })
          .select('name sku barcode')
          .lean()
      : [],
    suppliedVendor || (purchase.vendor ? Vendor.findById(refId(purchase.vendor)).lean() : null),
  ]);
  const productsById = new Map(products.map((product) => [String(product._id), product]));

  return {
    sourceType: 'PURCHASE',
    sale: null,
    purchase: purchase._id,
    documentNumber: purchase.number,
    warehouse: refId(purchase.warehouse),
    purchaseDate: purchase.date,
    vendorInfo: {
      vendor: vendor ? vendor._id : refId(purchase.vendor) || null,
      name: vendor ? vendor.name : purchase.vendorName || 'Vendor',
      phone: vendor ? vendor.phone || '' : '',
      email: vendor ? vendor.email || '' : '',
      address: vendor ? vendor.address || '' : '',
    },
    items: (purchase.items || []).map((item) => {
      const productId = refId(item.product);
      const product = productsById.get(String(productId));
      return {
        product: productId,
        name: item.name || (product && product.name) || 'Product',
        sku: (product && product.sku) || '',
        barcode: (product && product.barcode) || '',
        quantity: item.quantity,
        unitPrice: item.unitCost,
        lineTotal: item.lineTotal || 0,
      };
    }),
    pricing: {
      subtotal: purchase.subtotal,
      discount: purchase.discount || 0,
      taxPercent: 0,
      tax: purchase.tax || 0,
      total: purchase.total,
    },
    createdBy: refId(purchase.createdBy) || null,
  };
}

async function linkPurchase(purchaseId, gatePassId) {
  await GoodsPurchase.updateOne({ _id: purchaseId }, { $set: { gatePass: gatePassId } });
}

async function createForPurchase(purchase, vendor = null) {
  const snapshot = await purchaseSnapshot(purchase, vendor);
  let gatePass = await GatePass.findOne({ ...PURCHASE_FILTER, purchase: purchase._id });
  if (gatePass) {
    gatePass = await GatePass.findByIdAndUpdate(
      gatePass._id,
      { $set: snapshot },
      { returnDocument: 'after', runValidators: true },
    );
    await linkPurchase(purchase._id, gatePass._id);
    return gatePass;
  }

  const when = purchase.date ? new Date(purchase.date) : new Date();
  const number = await counterService.nextDocNumber('GATE', when.getFullYear(), 6);
  try {
    gatePass = await GatePass.create({
      number,
      token: crypto.randomBytes(32).toString('hex'),
      ...snapshot,
    });
  } catch (error) {
    if (error && error.code === 11000) {
      gatePass = await GatePass.findOne({ ...PURCHASE_FILTER, purchase: purchase._id });
      if (!gatePass) throw error;
    } else {
      throw error;
    }
  }

  await linkPurchase(purchase._id, gatePass._id);
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
  let gatePass = await GatePass.findById(id).populate('createdBy', 'name');
  if (!gatePass) throw ApiError.notFound('Gate pass not found');
  if (needsSnapshotRefresh(gatePass)) {
    const source =
      gatePass.sourceType === 'PURCHASE'
        ? await GoodsPurchase.findById(gatePass.purchase)
        : await Sale.findById(gatePass.sale);
    if (source) {
      if (gatePass.sourceType === 'PURCHASE') await createForPurchase(source);
      else await createForSale(source);
      gatePass = await GatePass.findById(gatePass._id).populate('createdBy', 'name');
    }
  }
  return gatePass;
}

async function getGatePassByPurchase(purchaseId) {
  const purchase = await GoodsPurchase.findById(purchaseId);
  if (!purchase) throw ApiError.notFound('Purchase not found');
  const gatePass = await createForPurchase(purchase);
  return getGatePassById(gatePass._id);
}

async function getGatePassBySale(saleId) {
  const sale = await Sale.findById(saleId);
  if (!sale) throw ApiError.notFound('Sale not found');
  const gatePass = await createForSale(sale);
  return getGatePassById(gatePass._id);
}

async function listGatePasses({ warehouse, status, sourceType, ...query } = {}) {
  await refreshLegacySaleGatePasses();
  const { page, limit, skip } = parsePagination(query);
  const filter = {};
  if (warehouse) filter.warehouse = warehouse;
  if (status) filter.status = status;
  if (sourceType) filter.sourceType = sourceType;

  const [gatePasses, total] = await Promise.all([
    GatePass.find(filter)
      .populate('createdBy', 'name')
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
  ).populate('createdBy', 'name');
  if (gatePass) {
    if (needsSnapshotRefresh(gatePass)) {
      const source =
        gatePass.sourceType === 'PURCHASE'
          ? await GoodsPurchase.findById(gatePass.purchase)
          : await Sale.findById(gatePass.sale);
      if (source) {
        if (gatePass.sourceType === 'PURCHASE') await createForPurchase(source);
        else await createForSale(source);
        return getGatePassById(gatePass._id);
      }
    }
    return gatePass;
  }

  const existing = await GatePass.findOne({ token });
  if (!existing) throw ApiError.notFound('Invalid gate pass QR code');
  if (existing.status === 'USED') throw ApiError.conflict('Gate pass has already been used');
  throw ApiError.conflict('Gate pass is cancelled');
}

module.exports = {
  QR_PREFIX,
  createForSale,
  createForPurchase,
  getGatePassById,
  getGatePassBySale,
  getGatePassByPurchase,
  listGatePasses,
  generateQrPng,
  scanGatePass,
};
