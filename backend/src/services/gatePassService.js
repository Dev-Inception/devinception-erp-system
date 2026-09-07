const crypto = require('crypto');
const QRCode = require('qrcode');
const { Op, QueryTypes } = require('sequelize');
const { getPostgres } = require('../db/postgres');
const { initializeModels } = require('../db/models');
const { isValidId } = require('../db/id');
const ApiError = require('../utils/ApiError');
const counterService = require('./counterService');
const { parsePagination } = require('../utils/query');
const { resolveWarehouseScope, warehouseWhere, actorStoreId } = require('../utils/storeScope');

const QR_PREFIX = 'ERP_GATE_PASS:';

function refId(value) {
  if (value === null || value === undefined) return value;
  if (typeof value === 'object') return value.id ?? value._id ?? value;
  return value;
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

async function saleSnapshot(sale, kind = 'CUSTOMER', warehouseId = null, transaction) {
  const { Product } = initializeModels();
  const resolvedWarehouseId = warehouseId || refId(sale.warehouse);
  const relevantItems = saleItemsForKind(sale, kind, resolvedWarehouseId);
  const productIds = [...new Set(relevantItems.map((item) => refId(item.product)).filter(Boolean))];
  const products = productIds.length
    ? await Product.findAll({
        where: { id: productIds },
        attributes: ['id', 'name', 'sku', 'barcode'],
        transaction,
      })
    : [];
  const productsById = new Map(products.map((product) => [String(product.id), product]));

  return {
    sourceType: 'SALE',
    kind,
    sale: sale.id,
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
  // A return is an append-only correction, never edited after the fact — its
  // gate pass is built complete at creation time and never needs refreshing
  // (unlike a SALE pass, which can be re-snapshotted if the sale is edited).
  if (gatePass.sourceType === 'RETURN') return false;
  if (['PROCESSED', 'USED'].includes(gatePass.status)) return false;
  const items = gatePass.items || [];
  return (
    !gatePass.saleDate ||
    !gatePass.partyName ||
    items.some((item) => !item.name || item.loadedQuantity === undefined)
  );
}

async function reloadWithItems(id, transaction) {
  const { GatePass, GatePassItem } = initializeModels();
  return GatePass.findByPk(id, {
    include: [{ model: GatePassItem, as: 'items', separate: true, order: [['position', 'ASC']] }],
    transaction,
  });
}

async function loadFull(where, transaction) {
  const { GatePass, GatePassItem, User } = initializeModels();
  return GatePass.findOne({
    where,
    include: [
      { model: GatePassItem, as: 'items', separate: true, order: [['position', 'ASC']] },
      { model: User, as: 'creator', attributes: ['id', 'name'] },
      { model: User, as: 'processor', attributes: ['id', 'name'] },
    ],
    transaction,
  });
}

async function replaceItems(gatePassId, items, transaction) {
  const { GatePassItem } = initializeModels();
  await GatePassItem.destroy({ where: { gatePassId }, transaction });
  await GatePassItem.bulkCreate(
    items.map((item, position) => ({ gatePassId, position, ...item })),
    { transaction },
  );
}

// Upserts this warehouse's entry into the sale's warehouseGatePasses join
// rows (create if new, repoint if a stale one exists for the same
// warehouse), and keeps the legacy singular `gatePass` pointer set to the
// first one ever created.
async function linkSale(saleId, gatePassId, kind, warehouseId, transaction) {
  const { Sale, SaleWarehouseGatePass } = initializeModels();
  if (kind === 'VENDOR') {
    await Sale.update({ vendorGatePass: gatePassId }, { where: { id: saleId }, transaction });
    return;
  }
  const [row, created] = await SaleWarehouseGatePass.findOrCreate({
    where: { sale: saleId, warehouse: warehouseId },
    defaults: { gatePass: gatePassId },
    transaction,
  });
  if (!created && row.gatePass !== gatePassId) {
    row.gatePass = gatePassId;
    await row.save({ transaction });
  }
  await Sale.update(
    { gatePass: gatePassId },
    { where: { id: saleId, gatePass: null }, transaction },
  );
}

// Creates (or refreshes) the one CUSTOMER/VENDOR gate pass for a sale +
// warehouse pair. Runs inside `transaction` when the caller supplies one
// (e.g. as part of atomically creating the sale itself); otherwise opens its
// own, e.g. for a standalone read-triggered self-heal.
async function createForSale(sale, kind = 'CUSTOMER', warehouseId = null, transaction) {
  if (!transaction) {
    return getPostgres().transaction((t) => createForSale(sale, kind, warehouseId, t));
  }
  const { GatePass } = initializeModels();

  const resolvedWarehouseId = String(warehouseId || refId(sale.warehouse));
  const snapshot = await saleSnapshot(sale, kind, resolvedWarehouseId, transaction);
  const identity = {
    sourceType: 'SALE',
    sale: sale.id,
    kind,
    warehouse: resolvedWarehouseId,
    saleReturn: null,
  };

  let gatePass = await GatePass.findOne({
    where: identity,
    transaction,
    lock: transaction.LOCK.UPDATE,
  });
  if (gatePass) {
    if (['PROCESSED', 'USED'].includes(gatePass.status)) {
      await linkSale(sale.id, gatePass.id, kind, resolvedWarehouseId, transaction);
      return reloadWithItems(gatePass.id, transaction);
    }
    await gatePass.update(
      {
        documentNumber: snapshot.documentNumber,
        partyName: snapshot.partyName,
        store: snapshot.store,
        saleDate: snapshot.saleDate,
      },
      { transaction },
    );
    await replaceItems(gatePass.id, snapshot.items, transaction);
    await linkSale(sale.id, gatePass.id, kind, resolvedWarehouseId, transaction);
    return reloadWithItems(gatePass.id, transaction);
  }

  const when = sale.date ? new Date(sale.date) : new Date();
  const number = await counterService.nextDocNumber('GATE', when.getFullYear(), 6, transaction);
  try {
    gatePass = await GatePass.create(
      {
        number,
        token: crypto.randomBytes(32).toString('hex'),
        sourceType: 'SALE',
        kind,
        sale: sale.id,
        documentNumber: snapshot.documentNumber,
        partyName: snapshot.partyName,
        store: snapshot.store,
        warehouse: resolvedWarehouseId,
        saleDate: snapshot.saleDate,
        createdBy: snapshot.createdBy,
      },
      { transaction },
    );
    await replaceItems(gatePass.id, snapshot.items, transaction);
  } catch (error) {
    if (error.name === 'SequelizeUniqueConstraintError') {
      gatePass = await GatePass.findOne({ where: identity, transaction });
      if (!gatePass) throw error;
    } else {
      throw error;
    }
  }

  await linkSale(sale.id, gatePass.id, kind, resolvedWarehouseId, transaction);
  return reloadWithItems(gatePass.id, transaction);
}

// Creates (or refreshes) one CUSTOMER gate pass per distinct warehouse the
// sale's WAREHOUSE-sourced lines came from, and — only when the sale has at
// least one vendor-sourced line — a single additional VENDOR gate pass
// covering all of those lines together.
async function createGatePassesForSale(sale, transaction) {
  if (!transaction) return getPostgres().transaction((t) => createGatePassesForSale(sale, t));

  const warehouseIds = [
    ...new Set(
      (sale.items || [])
        .filter((item) => item.source !== 'VENDOR')
        .map((item) => String(refId(item.warehouse) || refId(sale.warehouse))),
    ),
  ];
  const warehouseGatePasses = [];
  for (const warehouseId of warehouseIds) {
    const gatePass = await createForSale(sale, 'CUSTOMER', warehouseId, transaction);
    warehouseGatePasses.push({ warehouse: warehouseId, gatePass: gatePass.id });
  }
  const hasVendorItems = (sale.items || []).some((item) => item.source === 'VENDOR');
  const vendorGatePass = hasVendorItems
    ? await createForSale(sale, 'VENDOR', refId(sale.warehouse), transaction)
    : null;
  return { warehouseGatePasses, vendorGatePass };
}

// Snapshot for a RETURN gate pass — items restocked into one warehouse by
// this return (WAREHOUSE-sourced lines only; VENDOR-sourced lines never
// touched warehouse stock, so returning one restocks nothing).
function returnSnapshot(saleReturn, sale, warehouseId) {
  const relevantItems = (saleReturn.items || []).filter(
    (item) => item.source === 'WAREHOUSE' && String(refId(item.warehouse)) === String(warehouseId),
  );
  return {
    sourceType: 'RETURN',
    kind: 'CUSTOMER',
    sale: sale.id,
    saleReturn: saleReturn.id,
    documentNumber: saleReturn.number,
    partyName: saleReturn.customerName || '',
    store: refId(sale.store) || null,
    warehouse: warehouseId,
    saleDate: saleReturn.date,
    items: relevantItems.map((item) => ({
      product: refId(item.product),
      name: item.name,
      sku: '',
      barcode: '',
      quantity: item.quantity,
      loadedQuantity: null,
      loadConfirmed: false,
    })),
    createdBy: refId(saleReturn.createdBy) || null,
  };
}

// Creates one RETURN gate pass for the given warehouse's slice of a return.
// Unlike createForSale, this always mints a brand-new document — returns are
// append-only and never re-edited, so there's no existing-pass-to-refresh case.
async function createForReturn(saleReturn, sale, warehouseId, transaction) {
  if (!transaction) {
    return getPostgres().transaction((t) => createForReturn(saleReturn, sale, warehouseId, t));
  }
  const { GatePass } = initializeModels();
  const snapshot = returnSnapshot(saleReturn, sale, warehouseId);
  const when = saleReturn.date ? new Date(saleReturn.date) : new Date();
  const number = await counterService.nextDocNumber('GATE', when.getFullYear(), 6, transaction);
  try {
    const gatePass = await GatePass.create(
      {
        number,
        token: crypto.randomBytes(32).toString('hex'),
        sourceType: 'RETURN',
        kind: 'CUSTOMER',
        sale: snapshot.sale,
        saleReturn: snapshot.saleReturn,
        documentNumber: snapshot.documentNumber,
        partyName: snapshot.partyName,
        store: snapshot.store,
        warehouse: snapshot.warehouse,
        saleDate: snapshot.saleDate,
        createdBy: snapshot.createdBy,
      },
      { transaction },
    );
    await replaceItems(gatePass.id, snapshot.items, transaction);
    return reloadWithItems(gatePass.id, transaction);
  } catch (error) {
    if (error.name === 'SequelizeUniqueConstraintError') {
      const existing = await GatePass.findOne({
        where: { sourceType: 'RETURN', saleReturn: saleReturn.id, warehouse: warehouseId },
        transaction,
      });
      if (existing) return reloadWithItems(existing.id, transaction);
    }
    throw error;
  }
}

// One RETURN gate pass per distinct warehouse the return actually restocks
// — a return can span more than one warehouse if the original sale's lines
// did. A return with no WAREHOUSE-sourced lines (all VENDOR-sourced) gets none.
async function createGatePassesForReturn(saleReturn, sale, transaction) {
  if (!transaction)
    return getPostgres().transaction((t) => createGatePassesForReturn(saleReturn, sale, t));

  const warehouseIds = [
    ...new Set(
      (saleReturn.items || [])
        .filter((item) => item.source === 'WAREHOUSE' && item.warehouse)
        .map((item) => String(refId(item.warehouse))),
    ),
  ];
  const warehouseGatePasses = [];
  for (const warehouseId of warehouseIds) {
    const gatePass = await createForReturn(saleReturn, sale, warehouseId, transaction);
    warehouseGatePasses.push({ warehouse: warehouseId, gatePass: gatePass.id });
  }
  return { warehouseGatePasses };
}

// Snapshot for a PURCHASE gate pass — how much of each product actually
// arrived in sellable condition (the received quantity that's added to
// stock). Damaged units aren't included: they never enter stock, so there's
// nothing for the gate to confirm loading of.
function receiptSnapshot(stockReceipt) {
  const relevantItems = (stockReceipt.items || []).filter((item) => item.receivedQuantity > 0);
  return {
    sourceType: 'PURCHASE',
    kind: 'CUSTOMER',
    stockReceipt: stockReceipt.id,
    documentNumber: stockReceipt.number,
    partyName: stockReceipt.supplierName || '',
    store: refId(stockReceipt.store) || null,
    warehouse: refId(stockReceipt.warehouse),
    saleDate: stockReceipt.date,
    items: relevantItems.map((item) => ({
      product: refId(item.product),
      name: item.name,
      sku: '',
      barcode: '',
      quantity: item.receivedQuantity,
      loadedQuantity: null,
      loadConfirmed: false,
    })),
    createdBy: refId(stockReceipt.createdBy) || null,
  };
}

// Creates (or refreshes) the one PURCHASE gate pass for a stock receipt —
// receipts are edited in place (unlike a return), so this re-snapshots an
// existing pass the same way createForSale does for a revised sale, instead
// of always minting a new document.
async function createForReceipt(stockReceipt, transaction) {
  if (!transaction) return getPostgres().transaction((t) => createForReceipt(stockReceipt, t));
  const { GatePass } = initializeModels();
  const snapshot = receiptSnapshot(stockReceipt);

  // Nothing arrived in sellable condition — no gate pass needed (or wanted,
  // if a prior revision now has none).
  if (snapshot.items.length === 0) {
    await GatePass.destroy({
      where: { sourceType: 'PURCHASE', stockReceipt: stockReceipt.id },
      transaction,
    });
    return null;
  }

  let gatePass = await GatePass.findOne({
    where: { sourceType: 'PURCHASE', stockReceipt: stockReceipt.id },
    transaction,
    lock: transaction.LOCK.UPDATE,
  });
  if (gatePass) {
    if (['PROCESSED', 'USED'].includes(gatePass.status))
      return reloadWithItems(gatePass.id, transaction);
    await gatePass.update(
      {
        documentNumber: snapshot.documentNumber,
        partyName: snapshot.partyName,
        store: snapshot.store,
        warehouse: snapshot.warehouse,
        saleDate: snapshot.saleDate,
      },
      { transaction },
    );
    await replaceItems(gatePass.id, snapshot.items, transaction);
    return reloadWithItems(gatePass.id, transaction);
  }

  const when = stockReceipt.date ? new Date(stockReceipt.date) : new Date();
  const number = await counterService.nextDocNumber('GATE', when.getFullYear(), 6, transaction);
  try {
    gatePass = await GatePass.create(
      {
        number,
        token: crypto.randomBytes(32).toString('hex'),
        sourceType: 'PURCHASE',
        kind: 'CUSTOMER',
        stockReceipt: snapshot.stockReceipt,
        documentNumber: snapshot.documentNumber,
        partyName: snapshot.partyName,
        store: snapshot.store,
        warehouse: snapshot.warehouse,
        saleDate: snapshot.saleDate,
        createdBy: snapshot.createdBy,
      },
      { transaction },
    );
    await replaceItems(gatePass.id, snapshot.items, transaction);
  } catch (error) {
    if (error.name === 'SequelizeUniqueConstraintError') {
      gatePass = await GatePass.findOne({
        where: { sourceType: 'PURCHASE', stockReceipt: stockReceipt.id },
        transaction,
      });
      if (gatePass) return reloadWithItems(gatePass.id, transaction);
    }
    throw error;
  }
  return reloadWithItems(gatePass.id, transaction);
}

// Refreshes/backfills the sale that backs a gate pass. Shared by every
// lookup path (id, token, post-scan) so gate passes self-heal on read.
async function refreshSourceIfNeeded(gatePass, transaction) {
  if (!needsSnapshotRefresh(gatePass)) return gatePass;
  const { Sale, SaleItem } = initializeModels();
  const sale = await Sale.findByPk(gatePass.sale, {
    include: [{ model: SaleItem, as: 'items', separate: true, order: [['position', 'ASC']] }],
    transaction,
  });
  if (sale) {
    await createForSale(sale, gatePass.kind || 'CUSTOMER', gatePass.warehouse, transaction);
    return loadFull({ id: gatePass.id }, transaction);
  }
  return gatePass;
}

// Sum, per product, how much of this sale's warehouse-sourced stock has
// since been returned against the given warehouse — used to annotate a SALE
// gate pass's items with `returnedQuantity`.
async function sumReturnedQuantities(saleId, warehouseId, transaction) {
  const rows = await getPostgres().query(
    `SELECT sri.product_id AS product, SUM(sri.quantity) AS quantity
     FROM sale_return_items sri
     JOIN sale_returns sr ON sr.id = sri.sale_return_id
     WHERE sr.sale_id = :saleId AND sri.source = 'WAREHOUSE' AND sri.warehouse_id = :warehouseId
     GROUP BY sri.product_id`,
    { replacements: { saleId, warehouseId }, transaction, type: QueryTypes.SELECT },
  );
  const map = new Map();
  for (const row of rows) map.set(String(row.product), row.quantity);
  return map;
}

// A sale already collects the driver/vehicle and labour who's loading it at
// POS time — surface that on the gate pass response (as saleTransport/
// saleLabour) so the scan page can just display it instead of asking again.
async function withSaleExtras(gatePass, transaction) {
  if (!gatePass) return gatePass;
  const base = gatePass.toJSON();
  // Only a SALE pass (goods going out) needs this — a RETURN pass already
  // *is* the return, and its `sale` is only kept for context/lookups.
  if (base.sourceType !== 'SALE' || !gatePass.sale) return base;

  const { Sale, SaleLabour } = initializeModels();
  const sale = await Sale.findByPk(gatePass.sale, {
    attributes: ['transportDriverName', 'transportDriverPhone', 'transportVehicleNumber'],
    include: [{ model: SaleLabour, as: 'labour', separate: true, order: [['position', 'ASC']] }],
    transaction,
  });
  if (sale) {
    base.saleTransport = {
      driverName: sale.transportDriverName,
      driverPhone: sale.transportDriverPhone,
      vehicleNumber: sale.transportVehicleNumber,
    };
    base.saleLabour = sale.labour.map((l) => l.toJSON());
  }

  // Cross-reference returns against this sale so the original "goods going
  // out" pass also shows how much of each item has since come back — keeps
  // the two documents visibly connected instead of the return being
  // invisible from here.
  const returnedByProduct = await sumReturnedQuantities(gatePass.sale, base.warehouse, transaction);
  if (returnedByProduct.size > 0) {
    base.items = (base.items || []).map((item) => {
      const returned = returnedByProduct.get(String(item.product));
      return returned ? { ...item, returnedQuantity: returned } : item;
    });
  }

  return base;
}

async function getGatePassById(id, transaction) {
  if (!transaction) return getPostgres().transaction((t) => getGatePassById(id, t));
  const gatePass = await loadFull({ id }, transaction);
  if (!gatePass) throw ApiError.notFound('Gate pass not found');
  return withSaleExtras(await refreshSourceIfNeeded(gatePass, transaction), transaction);
}

async function getGatePassByToken(token, transaction) {
  if (!transaction) return getPostgres().transaction((t) => getGatePassByToken(token, t));
  const normalized = normalizeToken(token);
  if (!normalized) throw ApiError.badRequest('A gate pass token is required');
  const gatePass = await loadFull({ token: normalized }, transaction);
  if (!gatePass) throw ApiError.notFound('Invalid gate pass token');
  return withSaleExtras(await refreshSourceIfNeeded(gatePass, transaction), transaction);
}

async function getGatePassBySale(saleId, transaction) {
  if (!transaction) return getPostgres().transaction((t) => getGatePassBySale(saleId, t));
  const { Sale, SaleItem } = initializeModels();
  const sale = await Sale.findByPk(saleId, {
    include: [{ model: SaleItem, as: 'items', separate: true, order: [['position', 'ASC']] }],
    transaction,
  });
  if (!sale) throw ApiError.notFound('Sale not found');
  // Legacy single-pass lookup — the primary (first/only) warehouse's pass.
  const gatePass = await createForSale(sale, 'CUSTOMER', sale.warehouse, transaction);
  return getGatePassById(gatePass.id, transaction);
}

async function listGatePasses({
  warehouse,
  store,
  status,
  sourceType,
  from,
  to,
  actor,
  ...query
} = {}) {
  const { GatePass, User, Store } = initializeModels();
  const { page, limit, skip } = parsePagination(query);
  const where = {};
  // Gate passes copy their `store` from the originating sale — prefer that
  // direct field over the looser warehouse-membership scoping. A store-
  // restricted actor's own store always wins over the query param.
  const effectiveStore = actorStoreId(actor) || store;
  if (effectiveStore && isValidId(effectiveStore)) {
    where.store = effectiveStore;
  } else if (warehouse) {
    const { warehouseIds } = await resolveWarehouseScope({ warehouse, actor });
    Object.assign(where, warehouseWhere(warehouseIds));
  }
  if (status) where.status = status;
  if (sourceType) where.sourceType = sourceType;
  if (from || to) {
    where.saleDate = {};
    if (from) where.saleDate[Op.gte] = new Date(from);
    if (to) where.saleDate[Op.lte] = new Date(to);
  }

  const { rows, count } = await GatePass.findAndCountAll({
    where,
    include: [
      { model: User, as: 'creator', attributes: ['id', 'name'] },
      { model: User, as: 'processor', attributes: ['id', 'name'] },
      { model: Store, as: 'storeInfo', attributes: ['id', 'name', 'code'] },
    ],
    order: [['createdAt', 'DESC']],
    offset: skip,
    limit,
    distinct: true,
  });
  return { gatePasses: rows, total: count, page, limit };
}

function normalizeToken(value) {
  const raw = String(value || '').trim();
  return raw.startsWith(QR_PREFIX) ? raw.slice(QR_PREFIX.length) : raw;
}

async function generateQrPng(id) {
  const { GatePass } = initializeModels();
  // `token` has no defaultScope hiding it (only toJSON strips it), so a
  // plain findByPk already loads the raw column.
  const gatePass = await GatePass.findByPk(id);
  if (!gatePass) throw ApiError.notFound('Gate pass not found');
  const png = await QRCode.toBuffer(`${QR_PREFIX}${gatePass.token}`, {
    type: 'png',
    errorCorrectionLevel: 'M',
    margin: 2,
    width: 360,
  });
  return { gatePass, png };
}

// Flattens the admin/gatekeeper's `driver: {name, phone, licenseNumber,
// vehicleNumber}` payload into the model's flat columns (see
// db/models/gatePassModel.js / TRANSFORMS.GatePass for the reverse shaping).
function processingUpdate(payload, actor, { adminEdit = false } = {}) {
  const driver =
    payload.driver && (payload.driver.name || payload.driver.vehicleNumber) ? payload.driver : null;

  return {
    ...(driver
      ? {
          driverName: driver.name,
          driverPhone: driver.phone || '',
          driverLicenseNumber: driver.licenseNumber || '',
          driverVehicleNumber: driver.vehicleNumber,
        }
      : {}),
    loadNotes: payload.loadNotes || '',
    ...(payload.signatureData ? { signatureData: payload.signatureData } : {}),
    ...(adminEdit
      ? { lastEditedAt: new Date(), lastEditedBy: actor.id }
      : { status: 'PROCESSED', processedAt: new Date(), processedBy: actor.id }),
  };
}

function validateLoadedItems(gatePass, submittedItems) {
  const items = gatePass.items || [];
  if (!Array.isArray(submittedItems) || submittedItems.length !== items.length) {
    throw ApiError.badRequest('Every gate pass item must be checked');
  }
  const submittedByProduct = new Map(submittedItems.map((item) => [String(item.productId), item]));
  return items.map((item) => {
    const submitted = submittedByProduct.get(String(item.product));
    if (!submitted) throw ApiError.badRequest(`Load confirmation is missing for ${item.name}`);
    if (!submitted.loadConfirmed || Number(submitted.loadedQuantity) !== Number(item.quantity)) {
      throw ApiError.badRequest(`Loaded quantity for ${item.name} must match the gate pass`);
    }
    return {
      product: item.product,
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
  return getPostgres().transaction(async (transaction) => {
    const { GatePass, GatePassItem } = initializeModels();
    const token = normalizeToken(encodedValue);
    if (!token) throw ApiError.badRequest('A gate pass QR token is required');

    // `separate: true` — a plain hasMany include produces a LEFT OUTER JOIN,
    // which Postgres refuses to combine with FOR UPDATE ("cannot be applied
    // to the nullable side of an outer join"); running it as its own query
    // avoids that while still locking the GatePass row itself.
    const existing = await GatePass.findOne({
      where: { token },
      include: [{ model: GatePassItem, as: 'items', separate: true, order: [['position', 'ASC']] }],
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!existing) throw ApiError.notFound('Invalid gate pass QR code');
    if (['PROCESSED', 'USED'].includes(existing.status)) {
      throw ApiError.conflict('Gate pass has already been processed');
    }
    if (existing.status === 'CANCELLED') throw ApiError.conflict('Gate pass is cancelled');
    if (!['PENDING', 'ACTIVE'].includes(existing.status)) {
      throw ApiError.conflict('Gate pass has already been processed');
    }

    const items = validateLoadedItems(existing, payload.items);
    await replaceItems(existing.id, items, transaction);
    await existing.update(processingUpdate({ ...payload, items }, actor), { transaction });

    return loadFull({ id: existing.id }, transaction);
  });
}

async function updateProcessedGatePass(actor, id, payload) {
  return getPostgres().transaction(async (transaction) => {
    const { GatePass, GatePassItem } = initializeModels();
    const existing = await GatePass.findByPk(id, {
      include: [{ model: GatePassItem, as: 'items', separate: true, order: [['position', 'ASC']] }],
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!existing) throw ApiError.notFound('Gate pass not found');
    if (!['PROCESSED', 'USED'].includes(existing.status)) {
      throw ApiError.conflict('Only processed gate passes can be edited');
    }
    const items = validateLoadedItems(existing, payload.items);
    await replaceItems(existing.id, items, transaction);
    await existing.update(processingUpdate({ ...payload, items }, actor, { adminEdit: true }), {
      transaction,
    });

    return loadFull({ id: existing.id }, transaction);
  });
}

// Super-admin cleanup — removes the pass and unlinks it from whatever it
// documents (a sale's warehouse/vendor pass, or a return's), so a stale
// "View Gate Pass" button never points at a 404 afterward.
async function deleteGatePass(id, transaction) {
  if (!transaction) return getPostgres().transaction((t) => deleteGatePass(id, t));
  const { GatePass, Sale, SaleWarehouseGatePass, ReturnWarehouseGatePass, StockReceipt } =
    initializeModels();
  const gatePass = await GatePass.findByPk(id, { transaction });
  if (!gatePass) throw ApiError.notFound('Gate pass not found');

  if (gatePass.saleReturn) {
    await ReturnWarehouseGatePass.destroy({
      where: { saleReturn: gatePass.saleReturn, gatePass: gatePass.id },
      transaction,
    });
  } else if (gatePass.stockReceipt) {
    await StockReceipt.update(
      { gatePass: null },
      { where: { id: gatePass.stockReceipt, gatePass: gatePass.id }, transaction },
    );
  } else if (gatePass.sale) {
    if (gatePass.kind === 'VENDOR') {
      await Sale.update(
        { vendorGatePass: null },
        { where: { id: gatePass.sale, vendorGatePass: gatePass.id }, transaction },
      );
    } else {
      await SaleWarehouseGatePass.destroy({
        where: { sale: gatePass.sale, gatePass: gatePass.id },
        transaction,
      });
    }
    // Legacy singular pointer — the first warehouse pass a sale ever got.
    await Sale.update(
      { gatePass: null },
      { where: { id: gatePass.sale, gatePass: gatePass.id }, transaction },
    );
  }

  await gatePass.destroy({ transaction });
}

module.exports = {
  QR_PREFIX,
  createForSale,
  createGatePassesForSale,
  createForReturn,
  createGatePassesForReturn,
  createForReceipt,
  getGatePassById,
  getGatePassByToken,
  getGatePassBySale,
  listGatePasses,
  generateQrPng,
  processGatePass,
  updateProcessedGatePass,
  deleteGatePass,
};
