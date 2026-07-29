const { Op, QueryTypes } = require('sequelize');
const { initializeModels } = require('../db/models');
const { isValidId } = require('../db/id');
const { getPostgres } = require('../db/postgres');
const ApiError = require('../utils/ApiError');
const stockService = require('./stockService');
const journalService = require('./journalService');
const catalogService = require('./catalogService');
const { ACCOUNT, REF } = require('../utils/finance');
const { parsePagination } = require('../utils/query');
const { normalizeQuantity } = require('../utils/quantity');
const { assertProductWarehouse } = require('../utils/productWarehouse');
const { Product, StockLevel, Category, Brand, Unit } = initializeModels();

const catalogIncludes = [
  { model: Category, as: 'categoryInfo' },
  { model: Brand, as: 'brandInfo' },
  { model: Unit, as: 'unitInfo' },
];

function serializeProduct(product) {
  const value = product.toJSON();
  value.category = product.categoryInfo ? product.categoryInfo.toJSON() : null;
  value.brand = product.brandInfo ? product.brandInfo.toJSON() : null;
  value.unit = product.unitInfo ? product.unitInfo.toJSON() : null;
  delete value.categoryInfo;
  delete value.brandInfo;
  delete value.unitInfo;
  return value;
}

/**
 * Product catalog CRUD plus stock visibility. Prices/costs are paisa. Stock
 * adjustments here post a balancing journal entry against equity so inventory
 * value on the books always equals quantity × average cost.
 */

// Attach on-hand stock + value to products. With `warehouse` the figures are
// for that location; otherwise they are summed across all warehouses. Also
// flags low stock (on-hand at or below the product's minStock).
async function attachStock(products, warehouse) {
  const ids = products.map((p) => p.id);
  if (!ids.length) return [];
  const clauses = ['product_id IN (:ids)'];
  if (warehouse) clauses.push('warehouse_id = :warehouse');
  const levels = await getPostgres().query(
    `SELECT product_id, SUM(quantity) AS quantity,
            SUM(ROUND(ROUND(quantity, 6) * avg_cost)) AS value
       FROM stock_levels
      WHERE ${clauses.join(' AND ')}
      GROUP BY product_id`,
    {
      replacements: { ids, warehouse },
      type: QueryTypes.SELECT,
    },
  );
  const byId = new Map(levels.map((level) => [String(level.product_id), level]));
  return products.map((p) => {
    const s = byId.get(String(p.id));
    const stock = s ? normalizeQuantity(s.quantity) : 0;
    return {
      ...serializeProduct(p),
      stock,
      stockValue: s ? Number(s.value) : 0,
      lowStock: stock <= (p.minStock || 0),
    };
  });
}

async function listProducts({ search, warehouse, includeInactive = false, ...query } = {}) {
  // The inventory list and product pickers have no pagination UI, so this
  // endpoint allows a far larger page size than the default 100-row cap.
  const { page, limit, skip } = parsePagination(query, { defaultLimit: 1000, maxLimit: 100000 });
  const where = {};
  // Hide deactivated products from the catalog unless explicitly requested.
  if (!includeInactive) where.isActive = true;
  if (search) {
    const term = `%${search}%`;
    where[Op.or] = [
      { name: { [Op.iLike]: term } },
      { sku: { [Op.iLike]: term } },
      { barcode: { [Op.iLike]: term } },
    ];
  }

  // The unfiltered inventory is the complete product catalog. A warehouse
  // filter has a narrower meaning: only products currently in stock at that
  // location. This also keeps legacy products with stock rows in more than one
  // warehouse accurate until their ownership is migrated.
  if (warehouse && !isValidId(warehouse)) {
    throw ApiError.badRequest('Invalid warehouse');
  }
  if (warehouse) {
    const levels = await StockLevel.findAll({
      attributes: ['product'],
      where: {
        warehouse,
        quantity: { [Op.gt]: 0 },
      },
      group: ['product'],
      raw: true,
    });
    where.id = { [Op.in]: levels.map((level) => level.product) };
  }

  const [docs, total] = await Promise.all([
    Product.findAll({
      where,
      order: [['createdAt', 'DESC']],
      offset: skip,
      limit,
      include: catalogIncludes,
    }),
    Product.count({ where }),
  ]);

  const products = await attachStock(docs, warehouse);
  return { products, total, page, limit };
}

async function findProductById(id) {
  const product = await Product.findByPk(id, { include: catalogIncludes });
  if (!product) throw ApiError.notFound('Product not found');
  return product;
}

async function getProductById(id) {
  return serializeProduct(await findProductById(id));
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
  if (!isValidId(data.warehouse)) {
    throw ApiError.badRequest('A valid warehouse is required');
  }
  const warehouse = await require('./warehouseService').getWarehouseById(data.warehouse);
  if (data.sku) {
    const existing = await Product.findOne({ where: { sku: data.sku.toUpperCase() } });
    if (existing) throw ApiError.conflict('A product with that SKU already exists');
  }
  const fields = {};
  for (const k of WRITABLE) if (data[k] !== undefined) fields[k] = data[k];
  fields.warehouse = warehouse._id;
  // Resolve category/brand/unit to catalog ids (from an id or a free-text name).
  Object.assign(fields, await catalogService.resolveProductRefs(data));
  const product = await Product.create(fields);
  return getProductById(product.id);
}

async function updateProduct(id, data) {
  const product = await findProductById(id);
  if (data.sku !== undefined && data.sku && data.sku.toUpperCase() !== product.sku) {
    const existing = await Product.findOne({ where: { sku: data.sku.toUpperCase() } });
    if (existing) throw ApiError.conflict('A product with that SKU already exists');
  }
  for (const k of WRITABLE) if (data[k] !== undefined) product[k] = data[k];
  const refs = await catalogService.resolveProductRefs(data);
  for (const [k, v] of Object.entries(refs)) product[k] = v;
  await product.save();
  return getProductById(id);
}

async function deleteProduct(id) {
  const product = await findProductById(id);
  const hasStock = await StockLevel.count({
    where: { product: id, quantity: { [Op.ne]: 0 } },
  });
  if (hasStock) throw ApiError.badRequest('Product still has stock and cannot be deleted');
  // Remove the leftover zero-quantity stock rows so no orphans linger.
  await StockLevel.destroy({ where: { product: id } });
  await product.destroy();
}

// Current on-hand quantity for a product at a warehouse (summed across all
// warehouses when none is given). A cheap lookup the stock-adjust screen uses.
async function getStock(id, warehouse) {
  await getProductById(id); // 404 if the product doesn't exist
  const where = { product: id };
  if (warehouse && isValidId(warehouse)) where.warehouse = warehouse;
  const value = await StockLevel.sum('quantity', { where });
  return normalizeQuantity(value || 0);
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
  const product = await findProductById(id);

  // The id is shape-validated by the route, but a well-formed id that points at
  // no warehouse would still create stock + a journal entry against a ghost
  // location. Confirm it actually exists (throws 404 otherwise).
  const wh = await require('./warehouseService').getWarehouseById(warehouse);
  assertProductWarehouse(product, wh);

  const level = await StockLevel.findOne({
    where: { product: product.id, warehouse: wh.id },
  });
  const currentQty = level ? normalizeQuantity(level.quantity) : 0;

  // Resolve the signed change from either a typed quantity or an explicit delta.
  let signedDelta;
  if (type) {
    if (!(type in ADJUST_SIGN)) throw ApiError.badRequest('Invalid adjustment type');
    const qty = normalizeQuantity(quantity);
    if (!Number.isFinite(qty) || qty < 0)
      throw ApiError.badRequest('Quantity must be non-negative');
    signedDelta = normalizeQuantity(
      type === 'ADJUSTMENT' ? qty - currentQty : ADJUST_SIGN[type] * qty,
    );
  } else if (delta !== undefined) {
    signedDelta = normalizeQuantity(delta);
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

  await getPostgres().transaction(async (transaction) => {
    const valueDelta = await stockService.adjustStock(
      product.id,
      wh.id,
      signedDelta,
      cost,
      {
        refType: 'ADJUST',
        refNo: `ADJ-${product.sku || product.id}`,
      },
      transaction,
    );

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
        transaction,
      });
    }
  });

  return {
    product: await getProductById(id),
    newQty: normalizeQuantity(currentQty + signedDelta),
  };
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
