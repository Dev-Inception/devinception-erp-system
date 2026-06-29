const productService = require("../services/productService");
const asyncHandler = require("../utils/asyncHandler");
const { sendSuccess } = require("../utils/ApiResponse");
const { toPaisa, view } = require("../utils/money");

// paisa -> rupees for the wire.
const out = (p) => (p && p.toJSON ? p.toJSON() : p);
const serialize = (p) => view(out(p), ["purchasePrice", "salePrice", "stockValue"]);

const listProducts = asyncHandler(async (req, res) => {
  const { page, limit, search, warehouse, includeInactive } = req.query;
  const result = await productService.listProducts({
    page,
    limit,
    search,
    warehouse,
    includeInactive: includeInactive === "true",
  });
  return sendSuccess(res, 200, "Products fetched", {
    ...result,
    products: result.products.map(serialize),
  });
});

const getProduct = asyncHandler(async (req, res) => {
  const product = await productService.getProductById(req.params.id);
  return sendSuccess(res, 200, "Product fetched", { product: serialize(product) });
});

// Convert the rupee price fields on the way in.
function pricesToPaisa(data) {
  const d = { ...data };
  if (d.purchasePrice !== undefined) d.purchasePrice = toPaisa(d.purchasePrice);
  if (d.salePrice !== undefined) d.salePrice = toPaisa(d.salePrice);
  return d;
}

const createProduct = asyncHandler(async (req, res) => {
  const product = await productService.createProduct(pricesToPaisa(req.body));
  return sendSuccess(res, 201, "Product created", { product: serialize(product) });
});

const updateProduct = asyncHandler(async (req, res) => {
  const product = await productService.updateProduct(req.params.id, pricesToPaisa(req.body));
  return sendSuccess(res, 200, "Product updated", { product: serialize(product) });
});

const deleteProduct = asyncHandler(async (req, res) => {
  await productService.deleteProduct(req.params.id);
  return sendSuccess(res, 200, "Product deleted");
});

// Manual stock adjustment / opening stock.
const adjustStock = asyncHandler(async (req, res) => {
  const { warehouse, delta, unitCost, note } = req.body;
  const product = await productService.adjustStock(req.params.id, {
    warehouse,
    delta: Number(delta),
    unitCost: unitCost !== undefined ? toPaisa(unitCost) : 0,
    note,
    createdBy: req.user,
  });
  return sendSuccess(res, 200, "Stock adjusted", { product: serialize(product) });
});

module.exports = {
  listProducts,
  getProduct,
  createProduct,
  updateProduct,
  deleteProduct,
  adjustStock,
};
