const mongoose = require("mongoose");
const Product = require("../models/productModel");
const StockLevel = require("../models/stockLevelModel");
const ApiError = require("../utils/ApiError");
const stockService = require("./stockService");
const journalService = require("./journalService");
const { ACCOUNT, REF } = require("../utils/finance");
const { parsePagination, escapeRegex } = require("../utils/query");

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
        _id: "$product",
        quantity: { $sum: "$quantity" },
        value: { $sum: { $round: [{ $multiply: ["$quantity", "$avgCost"] }, 0] } },
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
  const { page, limit, skip } = parsePagination(query, { defaultLimit: 50 });
  const filter = {};
  // Hide deactivated products from the catalog unless explicitly requested.
  if (!includeInactive) filter.isActive = true;
  if (search) {
    const term = escapeRegex(search);
    filter.$or = [
      { name: { $regex: term, $options: "i" } },
      { sku: { $regex: term, $options: "i" } },
      { barcode: { $regex: term, $options: "i" } },
    ];
  }

  const [docs, total] = await Promise.all([
    Product.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    Product.countDocuments(filter),
  ]);

  const products = await attachStock(docs, warehouse);
  return { products, total, page, limit };
}

async function getProductById(id) {
  const product = await Product.findById(id);
  if (!product) throw ApiError.notFound("Product not found");
  return product;
}

const WRITABLE = ["name", "sku", "barcode", "category", "unit", "purchasePrice", "salePrice", "taxPercent", "minStock", "isActive"];

async function createProduct(data) {
  if (data.sku) {
    const existing = await Product.findOne({ sku: data.sku.toUpperCase() });
    if (existing) throw ApiError.conflict("A product with that SKU already exists");
  }
  const fields = {};
  for (const k of WRITABLE) if (data[k] !== undefined) fields[k] = data[k];
  return Product.create(fields);
}

async function updateProduct(id, data) {
  const product = await getProductById(id);
  if (data.sku !== undefined && data.sku && data.sku.toUpperCase() !== product.sku) {
    const existing = await Product.findOne({ sku: data.sku.toUpperCase() });
    if (existing) throw ApiError.conflict("A product with that SKU already exists");
  }
  for (const k of WRITABLE) if (data[k] !== undefined) product[k] = data[k];
  await product.save();
  return product;
}

async function deleteProduct(id) {
  const product = await getProductById(id);
  const hasStock = await StockLevel.exists({ product: id, quantity: { $ne: 0 } });
  if (hasStock) throw ApiError.badRequest("Product still has stock and cannot be deleted");
  // Remove the leftover zero-quantity stock rows so no orphans linger.
  await StockLevel.deleteMany({ product: id });
  await product.deleteOne();
}

/**
 * Manual stock adjustment / opening balance. `delta` is signed (paisa cost per
 * unit for positive deltas). Posts Dr/Cr Inventory against Equity so the
 * general ledger stays balanced.
 */
async function adjustStock(id, { warehouse, delta, unitCost = 0, note = "", createdBy }) {
  const product = await getProductById(id);

  // The id is shape-validated by the route, but a well-formed id that points at
  // no warehouse would still create stock + a journal entry against a ghost
  // location. Confirm it actually exists (throws 404 otherwise).
  const wh = await require("./warehouseService").getWarehouseById(warehouse);

  const valueDelta = await stockService.adjustStock(product._id, wh._id, delta, unitCost, {
    refType: "ADJUST",
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

  return getProductById(id);
}

module.exports = {
  listProducts,
  getProductById,
  createProduct,
  updateProduct,
  deleteProduct,
  adjustStock,
};
