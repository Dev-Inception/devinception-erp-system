const crypto = require('crypto');
const QRCode = require('qrcode');
const { Op } = require('sequelize');
const { initializeModels } = require('../db/models');
const { getPostgres } = require('../db/postgres');
const ApiError = require('../utils/ApiError');
const counterService = require('./counterService');
const { parsePagination } = require('../utils/query');

const {
  GatePass,
  GatePassItem,
  Sale,
  SaleItem,
  GoodsPurchase,
  GoodsPurchaseItem,
  Invoice,
  Customer,
  Vendor,
  Product,
  User,
} = initializeModels();

const QR_PREFIX = 'ERP_GATE_PASS:';

function refId(value) {
  return value && typeof value === 'object' ? value._id || value.id : value;
}

function actorId(actor) {
  return refId(actor) || null;
}

async function productsById(items, transaction) {
  const ids = [...new Set((items || []).map((item) => refId(item.product)).filter(Boolean))];
  if (!ids.length) return new Map();
  const products = await Product.findAll({
    where: { id: { [Op.in]: ids } },
    transaction,
  });
  return new Map(products.map((product) => [String(product.id), product]));
}

async function snapshotForSale(sale, suppliedCustomer, transaction) {
  const [products, customer] = await Promise.all([
    productsById(sale.items, transaction),
    suppliedCustomer ||
      (sale.customer ? Customer.findByPk(refId(sale.customer), { transaction }) : null),
  ]);

  return {
    parent: {
      sourceType: 'SALE',
      sale: refId(sale),
      purchase: null,
      documentNumber: sale.number,
      warehouse: refId(sale.warehouse),
      saleDate: sale.date,
      customer: customer ? refId(customer) : null,
      customerName: customer ? customer.name : sale.customerName || 'Walk-in',
      customerPhone: customer?.phone || '',
      customerEmail: customer?.email || '',
      customerAddress: customer?.address || '',
      vendor: null,
      vendorName: null,
      vendorPhone: '',
      vendorEmail: '',
      vendorAddress: '',
      pricingSubtotal: sale.subtotal,
      pricingDiscount: sale.discount || 0,
      pricingTaxPercent: sale.taxPercent || 0,
      pricingTax: sale.tax || 0,
      pricingTotal: sale.total,
      createdBy: refId(sale.createdBy) || null,
    },
    items: (sale.items || []).map((item, position) => {
      const productId = refId(item.product);
      const product = products.get(String(productId));
      return {
        position,
        product: productId,
        name: item.name || product?.name || 'Product',
        sku: product?.sku || '',
        barcode: product?.barcode || '',
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        lineTotal: item.lineTotal,
        loadedQuantity: null,
        loadConfirmed: false,
      };
    }),
  };
}

async function snapshotForPurchase(purchase, suppliedVendor, transaction) {
  const [products, vendor] = await Promise.all([
    productsById(purchase.items, transaction),
    suppliedVendor ||
      (purchase.vendor ? Vendor.findByPk(refId(purchase.vendor), { transaction }) : null),
  ]);

  return {
    parent: {
      sourceType: 'PURCHASE',
      sale: null,
      purchase: refId(purchase),
      documentNumber: purchase.number,
      warehouse: refId(purchase.warehouse),
      saleDate: purchase.date,
      customer: null,
      customerName: null,
      customerPhone: '',
      customerEmail: '',
      customerAddress: '',
      vendor: vendor ? refId(vendor) : null,
      vendorName: vendor ? vendor.name : purchase.vendorName || 'Vendor',
      vendorPhone: vendor?.phone || '',
      vendorEmail: vendor?.email || '',
      vendorAddress: vendor?.address || '',
      pricingSubtotal: purchase.subtotal,
      pricingDiscount: purchase.discount || 0,
      pricingTaxPercent: 0,
      pricingTax: purchase.tax || 0,
      pricingTotal: purchase.total,
      createdBy: refId(purchase.createdBy) || null,
    },
    items: (purchase.items || []).map((item, position) => {
      const productId = refId(item.product);
      const product = products.get(String(productId));
      return {
        position,
        product: productId,
        name: item.name || product?.name || 'Product',
        sku: product?.sku || '',
        barcode: product?.barcode || '',
        quantity: item.quantity,
        unitPrice: item.unitCost,
        lineTotal: item.lineTotal,
        loadedQuantity: null,
        loadConfirmed: false,
      };
    }),
  };
}

async function linkSource(gatePass, snapshot, transaction) {
  if (snapshot.parent.sourceType === 'SALE') {
    await Sale.update(
      { gatePass: gatePass.id },
      { where: { id: snapshot.parent.sale }, transaction },
    );
    return;
  }

  await Promise.all([
    GoodsPurchase.update(
      { gatePass: gatePass.id },
      { where: { id: snapshot.parent.purchase }, transaction },
    ),
    Invoice.update(
      { gatePass: gatePass.id },
      { where: { purchase: snapshot.parent.purchase }, transaction },
    ),
  ]);
}

async function persistSnapshot(snapshot, transaction) {
  const where =
    snapshot.parent.sourceType === 'SALE'
      ? { sale: snapshot.parent.sale }
      : { purchase: snapshot.parent.purchase };

  let gatePass = await GatePass.findOne({ where, transaction });
  if (gatePass) {
    if (gatePass.status === 'PENDING') {
      await gatePass.update(snapshot.parent, { transaction });
      await GatePassItem.destroy({ where: { gatePassId: gatePass.id }, transaction });
      await GatePassItem.bulkCreate(
        snapshot.items.map((item) => ({ ...item, gatePassId: gatePass.id })),
        { transaction, validate: true },
      );
    }
  } else {
    const when = snapshot.parent.saleDate ? new Date(snapshot.parent.saleDate) : new Date();
    gatePass = await GatePass.create(
      {
        ...snapshot.parent,
        number: await counterService.nextDocNumber('GATE', when.getFullYear(), 6, transaction),
        token: crypto.randomBytes(32).toString('hex'),
      },
      { transaction },
    );
    await GatePassItem.bulkCreate(
      snapshot.items.map((item) => ({ ...item, gatePassId: gatePass.id })),
      { transaction, validate: true },
    );
  }

  await linkSource(gatePass, snapshot, transaction);
  return gatePass;
}

async function createForSale(sale, customer = null, outerTransaction = null) {
  const write = async (transaction) =>
    persistSnapshot(await snapshotForSale(sale, customer, transaction), transaction);
  if (outerTransaction) return write(outerTransaction);
  return getPostgres().transaction(write);
}

async function createForPurchase(purchase, vendor = null, outerTransaction = null) {
  const write = async (transaction) =>
    persistSnapshot(await snapshotForPurchase(purchase, vendor, transaction), transaction);
  if (outerTransaction) return write(outerTransaction);
  return getPostgres().transaction(write);
}

const userInclude = (association) => ({
  model: User,
  as: association,
  attributes: ['id', 'name'],
});

function shapeGatePass(gatePass, { includeToken = false } = {}) {
  const value = gatePass.toJSON();
  if (!includeToken) delete value.token;

  value.customerInfo =
    value.sourceType === 'SALE'
      ? {
          customer: value.customer,
          name: value.customerName,
          phone: value.customerPhone,
          email: value.customerEmail,
          address: value.customerAddress,
        }
      : null;
  value.vendorInfo =
    value.sourceType === 'PURCHASE'
      ? {
          vendor: value.vendor,
          name: value.vendorName,
          phone: value.vendorPhone,
          email: value.vendorEmail,
          address: value.vendorAddress,
        }
      : null;
  value.pricing = {
    subtotal: value.pricingSubtotal,
    discount: value.pricingDiscount,
    taxPercent: value.pricingTaxPercent,
    tax: value.pricingTax,
    total: value.pricingTotal,
  };
  value.items = (gatePass.items || []).map((item) => item.toJSON());
  if (gatePass.creator) value.createdBy = gatePass.creator.toJSON();
  if (gatePass.processor) value.processedBy = gatePass.processor.toJSON();
  if (gatePass.lastEditor) value.lastEditedBy = gatePass.lastEditor.toJSON();
  return value;
}

async function loadGatePass(where, { includeToken = false, transaction, lock } = {}) {
  const gatePass = await GatePass.findOne({
    where,
    include: [
      { model: GatePassItem, as: 'items' },
      userInclude('creator'),
      userInclude('processor'),
      userInclude('lastEditor'),
    ],
    order: [[{ model: GatePassItem, as: 'items' }, 'position', 'ASC']],
    transaction,
    lock,
  });
  return gatePass ? shapeGatePass(gatePass, { includeToken }) : null;
}

async function getGatePassById(id) {
  const gatePass = await loadGatePass({ id });
  if (!gatePass) throw ApiError.notFound('Gate pass not found');
  return gatePass;
}

function normalizeToken(value) {
  const raw = String(value || '').trim();
  return raw.startsWith(QR_PREFIX) ? raw.slice(QR_PREFIX.length) : raw;
}

async function getGatePassByToken(token) {
  const normalized = normalizeToken(token);
  if (!normalized) throw ApiError.badRequest('A gate pass token is required');
  const gatePass = await loadGatePass({ token: normalized });
  if (!gatePass) throw ApiError.notFound('Invalid gate pass token');
  return gatePass;
}

async function getGatePassBySale(saleId) {
  const sale = await Sale.findByPk(saleId, {
    include: [{ model: SaleItem, as: 'items' }],
  });
  if (!sale) throw ApiError.notFound('Sale not found');
  return getGatePassById((await createForSale(sale)).id);
}

async function getGatePassByPurchase(purchaseId) {
  const purchase = await GoodsPurchase.findByPk(purchaseId, {
    include: [{ model: GoodsPurchaseItem, as: 'items' }],
  });
  if (!purchase) throw ApiError.notFound('Purchase not found');
  return getGatePassById((await createForPurchase(purchase)).id);
}

async function listGatePasses({ warehouse, status, sourceType, ...query } = {}) {
  const { page, limit, skip } = parsePagination(query);
  const where = {};
  if (warehouse) where.warehouse = warehouse;
  if (status) where.status = status;
  if (sourceType) where.sourceType = sourceType;

  const [rows, total] = await Promise.all([
    GatePass.findAll({
      where,
      include: [
        { model: GatePassItem, as: 'items' },
        userInclude('creator'),
        userInclude('processor'),
        userInclude('lastEditor'),
      ],
      order: [
        ['createdAt', 'DESC'],
        [{ model: GatePassItem, as: 'items' }, 'position', 'ASC'],
      ],
      offset: skip,
      limit,
      distinct: true,
    }),
    GatePass.count({ where }),
  ]);
  return { gatePasses: rows.map((row) => shapeGatePass(row)), total, page, limit };
}

async function generateQrPng(id) {
  const gatePass = await loadGatePass({ id }, { includeToken: true });
  if (!gatePass) throw ApiError.notFound('Gate pass not found');
  const png = await QRCode.toBuffer(`${QR_PREFIX}${gatePass.token}`, {
    type: 'png',
    errorCorrectionLevel: 'M',
    margin: 2,
    width: 360,
  });
  return { gatePass, png };
}

function validateLoadedItems(storedItems, submittedItems) {
  if (!Array.isArray(submittedItems) || submittedItems.length !== storedItems.length) {
    throw ApiError.badRequest('Every gate pass item must be checked');
  }

  const remaining = [...submittedItems];
  return storedItems.map((item) => {
    const index = remaining.findIndex(
      (submitted) => String(submitted.productId) === String(item.product),
    );
    const submitted = index >= 0 ? remaining.splice(index, 1)[0] : null;
    if (!submitted) throw ApiError.badRequest(`Load confirmation is missing for ${item.name}`);
    if (!submitted.loadConfirmed || Number(submitted.loadedQuantity) !== Number(item.quantity)) {
      throw ApiError.badRequest(`Loaded quantity for ${item.name} must match the gate pass`);
    }
    return {
      id: item.id,
      loadedQuantity: Number(submitted.loadedQuantity),
      loadConfirmed: true,
    };
  });
}

async function updateProcessingFields(
  gatePass,
  itemUpdates,
  payload,
  actor,
  transaction,
  adminEdit,
) {
  const by = actorId(actor);
  await gatePass.update(
    {
      driver: payload.driver,
      loadNotes: payload.loadNotes || '',
      ...(payload.signatureData ? { signatureData: payload.signatureData } : {}),
      ...(adminEdit
        ? { lastEditedAt: new Date(), lastEditedBy: by }
        : { status: 'PROCESSED', processedAt: new Date(), processedBy: by }),
    },
    { transaction },
  );
  await Promise.all(
    itemUpdates.map((item) =>
      GatePassItem.update(
        {
          loadedQuantity: item.loadedQuantity,
          loadConfirmed: item.loadConfirmed,
        },
        { where: { id: item.id, gatePassId: gatePass.id }, transaction },
      ),
    ),
  );
}

async function processGatePass(actor, encodedValue, payload) {
  const token = normalizeToken(encodedValue);
  if (!token) throw ApiError.badRequest('A gate pass QR token is required');

  return getPostgres().transaction(async (transaction) => {
    const gatePass = await GatePass.findOne({
      where: { token },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!gatePass) throw ApiError.notFound('Invalid gate pass QR code');
    if (gatePass.status === 'PROCESSED') {
      throw ApiError.conflict('Gate pass has already been processed');
    }
    if (gatePass.status === 'CANCELLED') throw ApiError.conflict('Gate pass is cancelled');

    const storedItems = await GatePassItem.findAll({
      where: { gatePassId: gatePass.id },
      order: [['position', 'ASC']],
      transaction,
    });
    const itemUpdates = validateLoadedItems(storedItems, payload.items);
    await updateProcessingFields(gatePass, itemUpdates, payload, actor, transaction, false);
    return loadGatePass({ id: gatePass.id }, { transaction });
  });
}

async function updateProcessedGatePass(actor, id, payload) {
  return getPostgres().transaction(async (transaction) => {
    const gatePass = await GatePass.findByPk(id, {
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!gatePass) throw ApiError.notFound('Gate pass not found');
    if (gatePass.status !== 'PROCESSED') {
      throw ApiError.conflict('Only processed gate passes can be edited');
    }

    const storedItems = await GatePassItem.findAll({
      where: { gatePassId: gatePass.id },
      order: [['position', 'ASC']],
      transaction,
    });
    const itemUpdates = validateLoadedItems(storedItems, payload.items);
    await updateProcessingFields(gatePass, itemUpdates, payload, actor, transaction, true);
    return loadGatePass({ id: gatePass.id }, { transaction });
  });
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
