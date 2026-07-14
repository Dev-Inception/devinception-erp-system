const productService = require('../services/productService');
const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/ApiResponse');
const { toPaisa, view } = require('../utils/money');
const env = require('../config/env');

const ACTIVE_WAREHOUSE_COOKIE = 'activeWarehouse';

function warehouseFromRequest(req) {
  return (
    req.body?.warehouse ||
    req.body?.warehouseId ||
    req.query?.warehouse ||
    req.query?.warehouseId ||
    req.headers['x-warehouse-id'] ||
    req.cookies?.[ACTIVE_WAREHOUSE_COOKIE]
  );
}

// paisa -> rupees for the wire.
const out = (p) => (p && p.toJSON ? p.toJSON() : p);

// A populated catalog ref -> { id, name(, abbreviation) }; tolerates a bare id
// or a legacy free-text string so older product rows still serialize cleanly.
function refObject(ref, withAbbrev) {
  if (!ref) return { id: undefined, obj: null };
  if (typeof ref === 'object') {
    const id = String(ref._id ?? ref.id);
    const obj = withAbbrev
      ? { id, name: ref.name, abbreviation: ref.abbreviation || ref.name }
      : { id, name: ref.name };
    return { id, obj };
  }
  // Unpopulated ObjectId or legacy string: surface it as both id and label.
  const id = String(ref);
  const obj = withAbbrev ? { id, name: id, abbreviation: id } : { id, name: id };
  return { id, obj };
}

function serialize(product) {
  const p = view(out(product), ['purchasePrice', 'salePrice', 'stockValue']);
  p.warehouseId = p.warehouse ? String(p.warehouse._id || p.warehouse) : undefined;
  const c = refObject(p.category);
  const b = refObject(p.brand);
  const u = refObject(p.unit, true);
  p.categoryId = c.id;
  p.brandId = b.id;
  p.unitId = u.id;
  p.category = c.obj;
  p.brand = b.obj;
  p.unit = u.obj;
  return p;
}

const listProducts = asyncHandler(async (req, res) => {
  const { page, limit, search, warehouse, warehouseId, includeInactive } = req.query;
  const selectedWarehouse = warehouse || warehouseId;
  const result = await productService.listProducts({
    page,
    limit,
    search,
    // `warehouse` is the canonical API parameter. Accept `warehouseId` as an
    // alias so clients using the UI field name are still correctly scoped.
    warehouse: selectedWarehouse,
    includeInactive: includeInactive === 'true',
  });
  if (selectedWarehouse) {
    // The current UI sends its selected warehouse on the list request but not
    // on product creation. Preserve that context server-side so the following
    // POST can still create the product under the correct warehouse.
    res.cookie(ACTIVE_WAREHOUSE_COOKIE, selectedWarehouse, {
      httpOnly: true,
      secure: env.nodeEnv === 'production',
      sameSite: 'strict',
    });
  }
  return sendSuccess(res, 200, 'Products fetched', {
    ...result,
    products: result.products.map(serialize),
  });
});

const getProduct = asyncHandler(async (req, res) => {
  const product = await productService.getProductById(req.params.id);
  return sendSuccess(res, 200, 'Product fetched', { product: serialize(product) });
});

// Convert the rupee price fields on the way in.
function pricesToPaisa(data) {
  const d = { ...data };
  if (d.purchasePrice !== undefined) d.purchasePrice = toPaisa(d.purchasePrice);
  if (d.salePrice !== undefined) d.salePrice = toPaisa(d.salePrice);
  return d;
}

const createProduct = asyncHandler(async (req, res) => {
  const product = await productService.createProduct(
    pricesToPaisa({
      ...req.body,
      warehouse: warehouseFromRequest(req),
    }),
  );
  return sendSuccess(res, 201, 'Product created', { product: serialize(product) });
});

const updateProduct = asyncHandler(async (req, res) => {
  const product = await productService.updateProduct(req.params.id, pricesToPaisa(req.body));
  return sendSuccess(res, 200, 'Product updated', { product: serialize(product) });
});

const deleteProduct = asyncHandler(async (req, res) => {
  await productService.deleteProduct(req.params.id);
  return sendSuccess(res, 200, 'Product deleted');
});

// Manual stock adjustment / opening stock. Accepts a first-class
// `{ type, quantity }` or a signed `delta`; returns the product and `newQty`.
const adjustStock = asyncHandler(async (req, res) => {
  const { warehouse, type, quantity, delta, unitCost, note } = req.body;
  const { product, newQty } = await productService.adjustStock(req.params.id, {
    warehouse,
    type,
    quantity: quantity !== undefined ? Number(quantity) : undefined,
    delta: delta !== undefined ? Number(delta) : undefined,
    unitCost: unitCost !== undefined && unitCost !== null ? toPaisa(unitCost) : undefined,
    note,
    createdBy: req.user,
  });
  return sendSuccess(res, 200, 'Stock adjusted', { product: serialize(product), newQty });
});

// Current on-hand quantity for a product (optionally at one warehouse).
const getStock = asyncHandler(async (req, res) => {
  const quantity = await productService.getStock(req.params.id, req.query.warehouse);
  return sendSuccess(res, 200, 'Stock fetched', { quantity });
});

module.exports = {
  listProducts,
  getProduct,
  createProduct,
  updateProduct,
  deleteProduct,
  adjustStock,
  getStock,
};
