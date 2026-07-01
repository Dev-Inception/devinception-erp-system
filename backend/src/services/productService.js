const mongoose = require('mongoose');
const Product = require('../models/productModel');
const StockLevel = require('../models/stockLevelModel');
const ApiError = require('../utils/ApiError');
const stockService = require('./stockService');
const journalService = require('./journalService');
const catalogService = require('./catalogService');
const { ACCOUNT, REF } = require('../utils/finance');
const { parsePagination, escapeRegex } = require('../utils/query');

/**
 * Product catalog CRUD plus stock visibility. Prices/costs are paisa. Stock
 * adjustments here post a balancing journal entry against equity so inventory
 * value on the books always equals quantity × average cost.
 */

// Attach on-hand stock + value to products. With `warehouse` the figures are
// for that location; otherwise they are summed across all warehouses. Also
// flags low stock (on-hand at or below the product's minStock).
async function attachStock(products, warehouse) {
  const ids = products.map((p) => p._id);
  const match = { product: { $in: ids } };
  // A malformed ?warehouse= would throw inside ObjectId(); ignore it and fall
  // back to all-warehouse totals rather than 500-ing the inventory list.
  if (warehouse && mongoose.isValidObjectId(warehouse)) {
    match.warehouse = new mongoose.Types.ObjectId(warehouse);
  }

  const levels = await StockLevel.aggregate([
    { $match: match },
    {
      $group: {
        _id: '$product',
        quantity: { $sum: '$quantity' },
        value: { $sum: { $round: [{ $multiply: ['$quantity', '$avgCost'] }, 0] } },
      },
    },
  ]);
  const byId = new Map(levels.map((l) => [String(l._id), l]));
  return products.map((p) => {
    const s = byId.get(String(p._id));
    const stock = s ? s.quantity : 0;
    return {
      ...p,
      stock,
      stockValue: s ? s.value : 0,
      lowStock: stock <= (p.minStock || 0),
    };
  });
}

async function listProducts({ search, warehouse, includeInactive = false, ...query } = {}) {
  // The inventory list, the POS/GP product pickers and the stock-adjust lookup
  // all consume the full catalog (the client has no pagination UI), so this
  // endpoint allows a far larger page size than the default 100-row cap.
  const { page, limit, skip } = parsePagination(query, { defaultLimit: 1000, maxLimit: 100000 });
  const filter = {};
  // Hide deactivated products from the catalog unless explicitly requested.
  if (!includeInactive) filter.isActive = true;
  if (search) {
    const term = escapeRegex(search);
    filter.$or = [
      { name: { $regex: term, $options: 'i' } },
      { sku: { $regex: term, $options: 'i' } },
      { barcode: { $regex: term, $options: 'i' } },
    ];
  }

  const [docs, total] = await Promise.all([
    Product.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('category brand unit')
      .lean(),
    Product.countDocuments(filter),
  ]);

  const products = await attachStock(docs, warehouse);
  return { products, total, page, limit };
}

async function getProductById(id) {
  const product = await Product.findById(id).populate('category brand unit');
  if (!product) throw ApiError.notFound('Product not found');
  return product;
}

// `category`/`brand`/`unit` are resolved from the payload by catalogService, so
// they aren't copied verbatim here.
const WRITABLE = [
  'name',
  'sku',
  'barcode',
  'purchasePrice',
  'salePrice',
  'taxPercent',
  'minStock',
  'isActive',
];

async function createProduct(data) {
  if (data.sku) {
    const existing = await Product.findOne({ sku: data.sku.toUpperCase() });
    if (existing) throw ApiError.conflict('A product with that SKU already exists');
  }
  const fields = {};
  for (const k of WRITABLE) if (data[k] !== undefined) fields[k] = data[k];
  // Resolve category/brand/unit to catalog ids (from an id or a free-text name).
  Object.assign(fields, await catalogService.resolveProductRefs(data));
  const product = await Product.create(fields);
  return getProductById(product._id);
}

async function updateProduct(id, data) {
  const product = await getProductById(id);
  if (data.sku !== undefined && data.sku && data.sku.toUpperCase() !== product.sku) {
    const existing = await Product.findOne({ sku: data.sku.toUpperCase() });
    if (existing) throw ApiError.conflict('A product with that SKU already exists');
  }
  for (const k of WRITABLE) if (data[k] !== undefined) product[k] = data[k];
  const refs = await catalogService.resolveProductRefs(data);
  for (const [k, v] of Object.entries(refs)) product[k] = v;
  await product.save();
  return getProductById(id);
}

async function deleteProduct(id) {
  const product = await getProductById(id);
  const hasStock = await StockLevel.exists({ product: id, quantity: { $ne: 0 } });
  if (hasStock) throw ApiError.badRequest('Product still has stock and cannot be deleted');
  // Remove the leftover zero-quantity stock rows so no orphans linger.
  await StockLevel.deleteMany({ product: id });
  await product.deleteOne();
}

// Current on-hand quantity for a product at a warehouse (summed across all
// warehouses when none is given). A cheap lookup the stock-adjust screen uses.
async function getStock(id, warehouse) {
  await getProductById(id); // 404 if the product doesn't exist
  const match = { product: new mongoose.Types.ObjectId(id) };
  if (warehouse && mongoose.isValidObjectId(warehouse)) {
    match.warehouse = new mongoose.Types.ObjectId(warehouse);
  }
  const rows = await StockLevel.aggregate([
    { $match: match },
    { $group: { _id: null, quantity: { $sum: '$quantity' } } },
  ]);
  return rows[0] ? rows[0].quantity : 0;
}

// How each first-class adjustment type maps to the sign of the change. An
// ADJUSTMENT sets the on-hand to an absolute target, so its sign is derived
// from the current quantity rather than fixed here.
const ADJUST_SIGN = { STOCK_IN: 1, STOCK_OUT: -1, DAMAGED: -1, ADJUSTMENT: 0 };

/**
 * Manual stock adjustment / opening balance. Accepts either a first-class
 * `type` + `quantity` (STOCK_IN / STOCK_OUT / DAMAGED / ADJUSTMENT, where
 * ADJUSTMENT sets the on-hand to `quantity`) or a signed `delta`. Positive
 * changes are valued at `unitCost` (defaulting to the catalog purchasePrice)
 * and post Dr/Cr Inventory against Equity so the ledger stays balanced.
 * Returns the product and the resulting on-hand quantity (`newQty`).
 */
async function adjustStock(
  id,
  { warehouse, type, quantity, delta, unitCost, note = '', createdBy },
) {
  const product = await getProductById(id);

  // The id is shape-validated by the route, but a well-formed id that points at
  // no warehouse would still create stock + a journal entry against a ghost
  // location. Confirm it actually exists (throws 404 otherwise).
  const wh = await require('./warehouseService').getWarehouseById(warehouse);

  const level = await StockLevel.findOne({ product: product._id, warehouse: wh._id });
  const currentQty = level ? level.quantity : 0;

  // Resolve the signed change from either a typed quantity or an explicit delta.
  let signedDelta;
  if (type) {
    if (!(type in ADJUST_SIGN)) throw ApiError.badRequest('Invalid adjustment type');
    const qty = Number(quantity);
    if (!Number.isFinite(qty) || qty < 0)
      throw ApiError.badRequest('Quantity must be non-negative');
    signedDelta = type === 'ADJUSTMENT' ? qty - currentQty : ADJUST_SIGN[type] * qty;
  } else if (delta !== undefined) {
    signedDelta = Number(delta);
  } else {
    throw ApiError.badRequest('An adjustment type (+ quantity) or a delta is required');
  }
  if (!Number.isFinite(signedDelta)) throw ApiError.badRequest('Invalid adjustment');

  // No net change (e.g. an ADJUSTMENT to the current quantity): nothing to post.
  if (signedDelta === 0) return { product, newQty: currentQty };

  // Positive changes need a unit cost; default to the catalog purchase price.
  const cost =
    signedDelta > 0
      ? unitCost !== undefined && unitCost !== null
        ? unitCost
        : product.purchasePrice || 0
      : 0;

  const valueDelta = await stockService.adjustStock(product._id, wh._id, signedDelta, cost, {
    refType: 'ADJUST',
    refNo: `ADJ-${product.sku || product._id}`,
  });

  if (valueDelta !== 0) {
    const lines =
      valueDelta > 0
        ? [
            journalService.line(ACCOUNT.INVENTORY, { debit: valueDelta }),
            journalService.line(ACCOUNT.EQUITY, { credit: valueDelta }),
          ]
        : [
            journalService.line(ACCOUNT.EQUITY, { debit: -valueDelta }),
            journalService.line(ACCOUNT.INVENTORY, { credit: -valueDelta }),
          ];
    await journalService.post({
      refType: REF.OPENING,
      description: note || `Stock adjustment: ${product.name}`,
      lines,
      createdBy,
    });
  }

  return { product: await getProductById(id), newQty: currentQty + signedDelta };
}

module.exports = {
  listProducts,
  getProductById,
  getStock,
  createProduct,
  updateProduct,
  deleteProduct,
  adjustStock,
};
