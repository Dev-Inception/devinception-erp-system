const crypto = require('crypto');
const QRCode = require('qrcode');
const GatePass = require('../models/gatePassModel');
const Sale = require('../models/saleModel');
const Product = require('../models/productModel');
const mongoose = require('mongoose');
const ApiError = require('../utils/ApiError');
const counterService = require('./counterService');
const { parsePagination } = require('../utils/query');
const {
  resolveWarehouseScope,
  warehouseMongoFilter,
  actorStoreId,
} = require('../utils/storeScope');

const QR_PREFIX = 'ERP_GATE_PASS:';
const SALE_FILTER = { sourceType: 'SALE' };

function refId(value) {
  return value && typeof value === 'object' && value._id ? value._id : value;
}

// CUSTOMER covers one warehouse's worth of this sale's WAREHOUSE-sourced
// lines — a sale spanning several warehouses gets one CUSTOMER pass per
// warehouse (see createGatePassesForSale). VENDOR covers every vendor-sourced
// line regardless of warehouse — a single additional pass, since that
// portion never touched any warehouse's stock.
function saleItemsForKind(sale, kind, warehouseId) {
  const items = sale.items || [];
  if (kind === 'VENDOR') return items.filter((item) => item.source === 'VENDOR');
  return items.filter((item) => {
    if (item.source === 'VENDOR') return false;
    // Sales recorded before per-line warehouses existed have no `warehouse`
    // on the item — treat those as belonging to the sale's own warehouse
    // (its only one, back then) so old gate passes keep refreshing correctly.
    const itemWarehouseId = refId(item.warehouse) || refId(sale.warehouse);
    return String(itemWarehouseId) === String(warehouseId);
  });
}

async function saleSnapshot(sale, kind = 'CUSTOMER', warehouseId = null) {
  const resolvedWarehouseId = warehouseId || refId(sale.warehouse);
  const relevantItems = saleItemsForKind(sale, kind, resolvedWarehouseId);
  const productIds = relevantItems.map((item) => refId(item.product)).filter(Boolean);
  const products = productIds.length
    ? await Product.find({ _id: { $in: productIds } })
        .select('name sku barcode')
        .lean()
    : [];
  const productsById = new Map(products.map((product) => [String(product._id), product]));

  return {
    sourceType: 'SALE',
    kind,
    sale: sale._id,
    documentNumber: sale.number,
    partyName: sale.customerName || '',
    store: refId(sale.store) || null,
    warehouse: resolvedWarehouseId,
    saleDate: sale.date,
    items: relevantItems.map((item) => {
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

function needsSnapshotRefresh(gatePass) {
  if (['PROCESSED', 'USED'].includes(gatePass.status)) return false;
  return (
    !gatePass.saleDate ||
    !gatePass.partyName ||
    (gatePass.items || []).some((item) => !item.name || item.loadedQuantity === undefined)
  );
}

async function linkSale(saleId, gatePassId, kind = 'CUSTOMER', warehouseId = null) {
  if (kind === 'VENDOR') {
    await Sale.updateOne({ _id: saleId }, { $set: { vendorGatePass: gatePassId } });
    return;
  }
  // CUSTOMER kind: upsert this warehouse's entry into `warehouseGatePasses`
  // (update in place if a stale snapshot for that warehouse already exists,
  // otherwise push a new entry), and keep the legacy singular `gatePass`
  // pointed at the first one created.
  await Sale.updateOne(
    { _id: saleId, 'warehouseGatePasses.warehouse': warehouseId },
    { $set: { 'warehouseGatePasses.$.gatePass': gatePassId } },
  );
  await Sale.updateOne(
    { _id: saleId, 'warehouseGatePasses.warehouse': { $ne: warehouseId } },
    { $push: { warehouseGatePasses: { warehouse: warehouseId, gatePass: gatePassId } } },
  );
  await Sale.updateOne({ _id: saleId, gatePass: null }, { $set: { gatePass: gatePassId } });
}

async function createForSale(sale, kind = 'CUSTOMER', warehouseId = null) {
  const resolvedWarehouseId = String(warehouseId || refId(sale.warehouse));
  const snapshot = await saleSnapshot(sale, kind, resolvedWarehouseId);
  const identity = { ...SALE_FILTER, sale: sale._id, kind, warehouse: resolvedWarehouseId };
  let gatePass = await GatePass.findOne(identity);
  if (gatePass) {
    if (['PROCESSED', 'USED'].includes(gatePass.status)) {
      await linkSale(sale._id, gatePass._id, kind, resolvedWarehouseId);
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
    await linkSale(sale._id, gatePass._id, kind, resolvedWarehouseId);
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
      gatePass = await GatePass.findOne(identity);
      if (!gatePass) throw error;
    } else {
      throw error;
    }
  }

  await linkSale(sale._id, gatePass._id, kind, resolvedWarehouseId);
  return gatePass;
}

// Creates (or refreshes) one CUSTOMER gate pass per distinct warehouse the
// sale's WAREHOUSE-sourced lines came from, and — only when the sale has at
// least one vendor-sourced line — a single additional VENDOR gate pass
// covering all of those lines together.
async function createGatePassesForSale(sale) {
  const warehouseIds = Array.from(
    new Set(
      (sale.items || [])
        .filter((item) => item.source !== 'VENDOR')
        .map((item) => String(refId(item.warehouse) || refId(sale.warehouse))),
    ),
  );
  const warehouseGatePasses = [];
  for (const warehouseId of warehouseIds) {
    const gatePass = await createForSale(sale, 'CUSTOMER', warehouseId);
    warehouseGatePasses.push({ warehouse: warehouseId, gatePass: gatePass._id });
  }
  const hasVendorItems = (sale.items || []).some((item) => item.source === 'VENDOR');
  const vendorGatePass = hasVendorItems
    ? await createForSale(sale, 'VENDOR', refId(sale.warehouse))
    : null;
  return { warehouseGatePasses, vendorGatePass };
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

// Refreshes/backfills the sale that backs a gate pass. Shared by every
// lookup path (id, token, post-scan) so gate passes self-heal on read.
async function refreshSourceIfNeeded(gatePass) {
  if (!needsSnapshotRefresh(gatePass)) return gatePass;
  const sale = await Sale.findById(gatePass.sale);
  if (sale) {
    await createForSale(sale, gatePass.kind || 'CUSTOMER', gatePass.warehouse);
    return GatePass.findById(gatePass._id).populate('createdBy', 'name');
  }
  return gatePass;
}

// A sale already collects the driver/vehicle and labour who's loading it at
// POS time (Sale.transport / Sale.labour) — surface that on the gate pass
// response so the scan page can just display it instead of asking again.
async function withSaleExtras(gatePass) {
  if (!gatePass || !gatePass.sale) return gatePass;
  const sale = await Sale.findById(gatePass.sale).select('transport labour');
  const base = gatePass.toJSON ? gatePass.toJSON() : { ...gatePass };
  if (sale) {
    base.saleTransport = sale.transport;
    base.saleLabour = sale.labour;
  }
  return base;
}

async function getGatePassById(id) {
  const gatePass = await GatePass.findById(id)
    .populate('createdBy', 'name')
    .populate('processedBy', 'name');
  if (!gatePass) throw ApiError.notFound('Gate pass not found');
  return withSaleExtras(await refreshSourceIfNeeded(gatePass));
}

async function getGatePassByToken(token) {
  const normalized = normalizeToken(token);
  if (!normalized) throw ApiError.badRequest('A gate pass token is required');
  const gatePass = await GatePass.findOne({ token: normalized })
    .populate('createdBy', 'name')
    .populate('processedBy', 'name');
  if (!gatePass) throw ApiError.notFound('Invalid gate pass token');
  return withSaleExtras(await refreshSourceIfNeeded(gatePass));
}

async function getGatePassBySale(saleId) {
  const sale = await Sale.findById(saleId);
  if (!sale) throw ApiError.notFound('Sale not found');
  // Legacy single-pass lookup — the primary (first/only) warehouse's pass.
  const gatePass = await createForSale(sale, 'CUSTOMER', sale.warehouse);
  return getGatePassById(gatePass._id);
}

async function listGatePasses({ warehouse, store, status, sourceType, actor, ...query } = {}) {
  await refreshLegacySaleGatePasses();
  const { page, limit, skip } = parsePagination(query);
  const filter = {};
  // Gate passes copy their `store` from the originating sale — prefer that
  // direct field over the looser warehouse-membership scoping. A store-
  // restricted actor's own store always wins over the query param.
  const effectiveStore = actorStoreId(actor) || store;
  if (effectiveStore && mongoose.isValidObjectId(effectiveStore)) {
    filter.store = effectiveStore;
  } else if (warehouse) {
    const { warehouseIds } = await resolveWarehouseScope({ warehouse, actor });
    Object.assign(filter, warehouseMongoFilter(warehouseIds));
  }
  if (status) filter.status = status;
  if (sourceType) filter.sourceType = sourceType;

  const [gatePasses, total] = await Promise.all([
    GatePass.find(filter)
      .populate('createdBy', 'name')
      .populate('processedBy', 'name')
      .populate('store', 'name code')
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
    // The gatekeeper flow no longer collects driver/vehicle info — identity
    // is captured via `processedBy` (the logged-in gatekeeper) instead. Only
    // set `driver` when the admin edit form actually supplies one.
    ...(payload.driver && (payload.driver.name || payload.driver.vehicleNumber)
      ? { driver: payload.driver }
      : {}),
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
  createGatePassesForSale,
  getGatePassById,
  getGatePassByToken,
  getGatePassBySale,
  listGatePasses,
  generateQrPng,
  processGatePass,
  updateProcessedGatePass,
};
