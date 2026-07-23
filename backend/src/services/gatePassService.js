const crypto = require('crypto');
const QRCode = require('qrcode');
const GatePass = require('../models/gatePassModel');
const Sale = require('../models/saleModel');
const GoodsPurchase = require('../models/goodsPurchaseModel');
const Invoice = require('../models/invoiceModel');
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

async function saleSnapshot(sale) {
  const productIds = (sale.items || []).map((item) => refId(item.product)).filter(Boolean);
  const products = productIds.length
    ? await Product.find({ _id: { $in: productIds } })
        .select('name sku barcode')
        .lean()
    : [];
  const productsById = new Map(products.map((product) => [String(product._id), product]));

  return {
    sourceType: 'SALE',
    sale: sale._id,
    purchase: null,
    documentNumber: sale.number,
    warehouse: refId(sale.warehouse),
    saleDate: sale.date,
    items: (sale.items || []).map((item) => {
      const productId = refId(item.product);
      const product = productsById.get(String(productId));
      return {
        product: productId,
        name: item.name || (product && product.name) || 'Product',
        sku: (product && product.sku) || '',
        barcode: (product && product.barcode) || '',
        quantity: item.quantity,
        loadedQuantity: null,
        loadConfirmed: false,
      };
    }),
    createdBy: refId(sale.createdBy) || null,
  };
}

async function purchaseSnapshot(purchase) {
  const productIds = (purchase.items || []).map((item) => refId(item.product)).filter(Boolean);
  const products = productIds.length
    ? await Product.find({ _id: { $in: productIds } })
        .select('name sku barcode')
        .lean()
    : [];
  const productsById = new Map(products.map((product) => [String(product._id), product]));

  return {
    sourceType: 'PURCHASE',
    sale: null,
    purchase: purchase._id,
    documentNumber: purchase.number,
    warehouse: refId(purchase.warehouse),
    saleDate: purchase.date,
    items: (purchase.items || []).map((item) => {
      const productId = refId(item.product);
      const product = productsById.get(String(productId));
      return {
        product: productId,
        name: item.name || (product && product.name) || 'Product',
        sku: (product && product.sku) || '',
        barcode: (product && product.barcode) || '',
        quantity: item.quantity,
        loadedQuantity: null,
        loadConfirmed: false,
      };
    }),
    createdBy: refId(purchase.createdBy) || null,
  };
}

function needsSnapshotRefresh(gatePass) {
  if (['PROCESSED', 'USED'].includes(gatePass.status)) return false;
  return (
    !gatePass.saleDate ||
    (gatePass.items || []).some((item) => !item.name || item.loadedQuantity === undefined)
  );
}

async function linkSale(saleId, gatePassId) {
  await Sale.updateOne({ _id: saleId }, { $set: { gatePass: gatePassId } });
}

async function linkPurchase(purchaseId, gatePassId) {
  await Promise.all([
    GoodsPurchase.updateOne({ _id: purchaseId }, { $set: { gatePass: gatePassId } }),
    Invoice.updateOne({ purchase: purchaseId }, { $set: { gatePass: gatePassId } }),
  ]);
}

async function createForSale(sale) {
  const snapshot = await saleSnapshot(sale);
  let gatePass = await GatePass.findOne({ ...SALE_FILTER, sale: sale._id });
  if (gatePass) {
    if (['PROCESSED', 'USED'].includes(gatePass.status)) {
      await linkSale(sale._id, gatePass._id);
      return gatePass;
    }
    gatePass = await GatePass.findByIdAndUpdate(
      gatePass._id,
      {
        $set: snapshot,
        $unset: { customerInfo: 1, vendorInfo: 1, pricing: 1 },
      },
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

async function createForPurchase(purchase) {
  const snapshot = await purchaseSnapshot(purchase);
  let gatePass = await GatePass.findOne({ ...PURCHASE_FILTER, purchase: purchase._id });
  if (gatePass) {
    if (['PROCESSED', 'USED'].includes(gatePass.status)) {
      await linkPurchase(purchase._id, gatePass._id);
      return gatePass;
    }
    gatePass = await GatePass.findByIdAndUpdate(
      gatePass._id,
      {
        $set: snapshot,
        $unset: { customerInfo: 1, vendorInfo: 1, pricing: 1 },
      },
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

// Upgrade legacy status names without changing the meaning of old passes.
async function refreshLegacySaleGatePasses() {
  await Promise.all([
    GatePass.updateMany({ status: 'ACTIVE' }, { $set: { status: 'PENDING' } }),
    GatePass.collection.updateMany({ status: 'USED' }, [
      {
        $set: {
          status: 'PROCESSED',
          processedAt: { $ifNull: ['$processedAt', '$scannedAt'] },
          processedBy: { $ifNull: ['$processedBy', '$scannedBy'] },
        },
      },
    ]),
    GatePass.collection.updateMany(
      {},
      {
        $unset: {
          customerInfo: '',
          vendorInfo: '',
          pricing: '',
          'items.$[].unitPrice': '',
          'items.$[].lineTotal': '',
        },
      },
    ),
  ]);
}

// Refreshes/backfills whichever source document backs a gate pass. Shared by
// every lookup path (id, token, post-scan) so both SALE and PURCHASE gate
// passes self-heal on read the same way.
async function refreshSourceIfNeeded(gatePass) {
  if (!needsSnapshotRefresh(gatePass)) return gatePass;
  if (gatePass.sourceType === 'PURCHASE') {
    const purchase = await GoodsPurchase.findById(gatePass.purchase);
    if (purchase) {
      await createForPurchase(purchase);
      return GatePass.findById(gatePass._id).populate('createdBy', 'name');
    }
    return gatePass;
  }
  const sale = await Sale.findById(gatePass.sale);
  if (sale) {
    await createForSale(sale);
    return GatePass.findById(gatePass._id).populate('createdBy', 'name');
  }
  return gatePass;
}

async function getGatePassById(id) {
  const gatePass = await GatePass.findById(id)
    .populate('createdBy', 'name')
    .populate('processedBy', 'name');
  if (!gatePass) throw ApiError.notFound('Gate pass not found');
  return refreshSourceIfNeeded(gatePass);
}

async function getGatePassByToken(token) {
  const normalized = normalizeToken(token);
  if (!normalized) throw ApiError.badRequest('A gate pass token is required');
  const gatePass = await GatePass.findOne({ token: normalized }).populate('createdBy', 'name');
  if (!gatePass) throw ApiError.notFound('Invalid gate pass token');
  return refreshSourceIfNeeded(gatePass);
}

async function getGatePassBySale(saleId) {
  const sale = await Sale.findById(saleId);
  if (!sale) throw ApiError.notFound('Sale not found');
  const gatePass = await createForSale(sale);
  return getGatePassById(gatePass._id);
}

async function getGatePassByPurchase(purchaseId) {
  const purchase = await GoodsPurchase.findById(purchaseId);
  if (!purchase) throw ApiError.notFound('Purchase not found');
  const gatePass = await createForPurchase(purchase);
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
      .populate('processedBy', 'name')
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

function processingUpdate(payload, actor, { adminEdit = false } = {}) {
  return {
    driver: payload.driver,
    items: payload.items.map((item) => ({
      product: item.productId,
      name: item.name,
      sku: item.sku || '',
      barcode: item.barcode || '',
      quantity: item.quantity,
      loadedQuantity: item.loadedQuantity,
      loadConfirmed: item.loadConfirmed,
    })),
    loadNotes: payload.loadNotes || '',
    ...(payload.signatureData ? { signatureData: payload.signatureData } : {}),
    ...(adminEdit
      ? { lastEditedAt: new Date(), lastEditedBy: actor._id }
      : {
          status: 'PROCESSED',
          processedAt: new Date(),
          processedBy: actor._id,
        }),
  };
}

function validateLoadedItems(gatePass, submittedItems) {
  if (!Array.isArray(submittedItems) || submittedItems.length !== gatePass.items.length) {
    throw ApiError.badRequest('Every gate pass item must be checked');
  }
  const submittedByProduct = new Map(submittedItems.map((item) => [String(item.productId), item]));
  return gatePass.items.map((item) => {
    const submitted = submittedByProduct.get(String(item.product));
    if (!submitted) throw ApiError.badRequest(`Load confirmation is missing for ${item.name}`);
    if (!submitted.loadConfirmed || Number(submitted.loadedQuantity) !== Number(item.quantity)) {
      throw ApiError.badRequest(`Loaded quantity for ${item.name} must match the gate pass`);
    }
    return {
      productId: item.product,
      name: item.name,
      sku: item.sku,
      barcode: item.barcode,
      quantity: item.quantity,
      loadedQuantity: Number(submitted.loadedQuantity),
      loadConfirmed: true,
    };
  });
}

async function processGatePass(actor, encodedValue, payload) {
  const token = normalizeToken(encodedValue);
  if (!token) throw ApiError.badRequest('A gate pass QR token is required');
  const existing = await GatePass.findOne({ token });
  if (!existing) throw ApiError.notFound('Invalid gate pass QR code');
  if (['PROCESSED', 'USED'].includes(existing.status)) {
    throw ApiError.conflict('Gate pass has already been processed');
  }
  if (existing.status === 'CANCELLED') throw ApiError.conflict('Gate pass is cancelled');

  const items = validateLoadedItems(existing, payload.items);
  const gatePass = await GatePass.findOneAndUpdate(
    { token, status: { $in: ['PENDING', 'ACTIVE'] } },
    { $set: processingUpdate({ ...payload, items }, actor) },
    { returnDocument: 'after', runValidators: true },
  )
    .populate('createdBy', 'name')
    .populate('processedBy', 'name');
  if (!gatePass) throw ApiError.conflict('Gate pass has already been processed');
  return gatePass;
}

async function updateProcessedGatePass(actor, id, payload) {
  const existing = await GatePass.findById(id);
  if (!existing) throw ApiError.notFound('Gate pass not found');
  if (!['PROCESSED', 'USED'].includes(existing.status)) {
    throw ApiError.conflict('Only processed gate passes can be edited');
  }
  const items = validateLoadedItems(existing, payload.items);
  return GatePass.findByIdAndUpdate(
    id,
    { $set: processingUpdate({ ...payload, items }, actor, { adminEdit: true }) },
    { returnDocument: 'after', runValidators: true },
  )
    .populate('createdBy', 'name')
    .populate('processedBy', 'name');
}

module.exports = {
  QR_PREFIX,
  createForSale,
  createForPurchase,
  getGatePassById,
  getGatePassByToken,
  getGatePassBySale,
  getGatePassByPurchase,
  listGatePasses,
  generateQrPng,
  processGatePass,
  updateProcessedGatePass,
};
