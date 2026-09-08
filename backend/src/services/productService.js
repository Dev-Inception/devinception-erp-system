const { Op, fn, col } = require('sequelize');
const { getPostgres } = require('../db/postgres');
const { initializeModels } = require('../db/models');
const { isValidId } = require('../db/id');
const ApiError = require('../utils/ApiError');
const stockService = require('./stockService');
const journalService = require('./journalService');
const catalogService = require('./catalogService');
const { ACCOUNT, REF } = require('../utils/finance');
const { parsePagination } = require('../utils/query');
const { normalizeQuantity } = require('../utils/quantity');
const { resolveWarehouseScope, warehouseWhere } = require('../utils/storeScope');

/**
 * Product catalog CRUD plus stock visibility. Prices/costs are paisa. Stock
 * adjustments here post a balancing journal entry against equity so inventory
 * value on the books always equals quantity × average cost.
 */

// Escapes ILIKE wildcards so a search term is matched literally.
function escapeLike(str) {
  return String(str).replace(/[\\%_]/g, '\\$&');
}

const CATALOG_INCLUDE = () => {
  const { Category, Brand, Unit } = initializeModels();
  return [
    { model: Category, as: 'categoryInfo' },
    { model: Brand, as: 'brandInfo' },
    { model: Unit, as: 'unitInfo' },
  ];
};

// Reshape a Sequelize Product instance (queried with the catalog includes
// above) into the Mongo-`populate`-shaped plain object the controller
// expects: the resolved category/brand/unit sit at `category`/`brand`/`unit`
// (not the `*Info` association alias), same field name the raw FK id would
// otherwise occupy. Only touches a key when its association was actually
// included, so a query without includes leaves the bare id in place —
// matching an "unpopulated" ref, same as the original Mongo code.
function presentProduct(instance) {
  const json = instance.toJSON();
  if ('categoryInfo' in json) {
    json.category = json.categoryInfo;
    delete json.categoryInfo;
  }
  if ('brandInfo' in json) {
    json.brand = json.brandInfo;
    delete json.brandInfo;
  }
  if ('unitInfo' in json) {
    json.unit = json.unitInfo;
    delete json.unitInfo;
  }
  return json;
}

async function findProductOrThrow(id, transaction) {
  const { Product } = initializeModels();
  const product = await Product.findByPk(id, { transaction });
  if (!product) throw ApiError.notFound('Product not found');
  return product;
}

// Attach on-hand stock + value to products. With `warehouseIds` the figures
// are for those locations; otherwise they are summed across all warehouses.
// Also flags low stock (on-hand at or below the product's minStock).
async function attachStock(products, warehouseIds) {
  const { StockLevel } = initializeModels();
  const ids = products.map((p) => p._id);
  // Always re-derive the match here (rather than trusting the caller) so a
  // warehouse/store-scoped response can never mix stock levels from other
  // locations.
  const levels = ids.length
    ? await StockLevel.findAll({
        where: { product: { [Op.in]: ids }, ...warehouseWhere(warehouseIds) },
      })
    : [];

  const byId = new Map();
  for (const l of levels) {
    const key = String(l.product);
    const agg = byId.get(key) || { quantity: 0, value: 0 };
    agg.quantity += Number(l.quantity);
    agg.value += Math.round(normalizeQuantity(l.quantity) * l.avgCost);
    byId.set(key, agg);
  }
  return products.map((p) => {
    const s = byId.get(p._id);
    const stock = s ? normalizeQuantity(s.quantity) : 0;
    return {
      ...p,
      stock,
      stockValue: s ? s.value : 0,
      lowStock: stock <= (p.minStock || 0),
    };
  });
}

// Like attachStock, but expands each product into one row per warehouse that
// actually has a StockLevel record for it (instead of one row with the
// total summed across every warehouse). Used by the POS product search,
// which needs to know per-warehouse availability to offer a per-line
// warehouse picker — a plain product listing has no use for this shape.
// Falls back to a single row on the product's own owning warehouse (0 stock)
// for a product that has never been stocked anywhere, so it still shows up
// in search results (the cashier can still source it from a vendor).
async function attachStockByWarehouse(products, warehouseIds) {
  const { StockLevel } = initializeModels();
  const ids = products.map((p) => p._id);
  const levels = ids.length
    ? await StockLevel.findAll({
        where: { product: { [Op.in]: ids }, ...warehouseWhere(warehouseIds) },
      })
    : [];

  const levelsByProduct = new Map();
  for (const l of levels) {
    if (!(normalizeQuantity(l.quantity) > 0)) continue;
    const key = String(l.product);
    if (!levelsByProduct.has(key)) levelsByProduct.set(key, []);
    levelsByProduct.get(key).push(l);
  }

  const rows = [];
  for (const p of products) {
    const productLevels = levelsByProduct.get(p._id);
    if (!productLevels || productLevels.length === 0) {
      rows.push({
        ...p,
        stock: 0,
        stockValue: 0,
        lowStock: true,
        warehouseId: p.warehouse ? String(p.warehouse) : null,
      });
      continue;
    }
    for (const l of productLevels) {
      const stock = normalizeQuantity(l.quantity);
      rows.push({
        ...p,
        stock,
        stockValue: Math.round(stock * (l.avgCost || 0)),
        lowStock: stock <= (p.minStock || 0),
        warehouseId: String(l.warehouse),
      });
    }
  }
  return rows;
}

async function listProducts({
  search,
  warehouse,
  store,
  category,
  includeInactive = false,
  perWarehouse = false,
  actor,
  ...query
} = {}) {
  const { Product } = initializeModels();
  // The inventory list and product pickers have no pagination UI, so this
  // endpoint allows a far larger page size than the default 100-row cap.
  const { page, limit, skip } = parsePagination(query, { defaultLimit: 1000, maxLimit: 100000 });
  const where = {};
  // Hide deactivated products from the catalog unless explicitly requested.
  if (!includeInactive) where.isActive = true;
  if (search) {
    const term = `%${escapeLike(search)}%`;
    where[Op.or] = [
      { name: { [Op.iLike]: term } },
      { sku: { [Op.iLike]: term } },
      { barcode: { [Op.iLike]: term } },
    ];
  }
  if (category && isValidId(category)) where.category = category;

  // The unfiltered inventory is the complete product catalog. A warehouse/
  // store filter has a narrower meaning: only products *owned by* that
  // location (or one of the store's locations) — the same single `warehouse`
  // field the response already serializes as `warehouseId`. Filtering by
  // StockLevel presence instead would surface a product under a warehouse
  // other than the one shown in its own response (e.g. a stray manual stock
  // adjustment posted to the wrong location), which reads as "the same
  // inventory item is in two warehouses" even though it only has one owner.
  const { warehouseIds } = await resolveWarehouseScope({ warehouse, store, actor });
  if (warehouseIds) {
    Object.assign(where, warehouseWhere(warehouseIds));
  }

  const [docs, total] = await Promise.all([
    Product.findAll({
      where,
      order: [['createdAt', 'DESC']],
      offset: skip,
      limit,
      include: CATALOG_INCLUDE(),
    }),
    Product.count({ where }),
  ]);

  const presented = docs.map(presentProduct);
  const products = perWarehouse
    ? await attachStockByWarehouse(presented, warehouseIds)
    : await attachStock(presented, warehouseIds);
  // A per-warehouse expansion can turn N products into more than N rows
  // (one per stocked warehouse) — `total` stays the product count, matching
  // what the search UI actually cares about ("N products matched").
  return { products, total, page, limit };
}

async function getProductById(id) {
  const { Product } = initializeModels();
  const product = await Product.findByPk(id, { include: CATALOG_INCLUDE() });
  if (!product) throw ApiError.notFound('Product not found');
  return presentProduct(product);
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
  'image',
];

async function createProduct(data) {
  const { Product } = initializeModels();
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
  fields.warehouse = warehouse.id;
  // Resolve category/brand/unit to catalog ids (from an id or a free-text name).
  Object.assign(fields, await catalogService.resolveProductRefs(data));
  const product = await Product.create(fields);
  return getProductById(product.id);
}

async function updateProduct(id, data) {
  const product = await findProductOrThrow(id);
  if (data.sku !== undefined && data.sku && data.sku.toUpperCase() !== product.sku) {
    const { Product } = initializeModels();
    const existing = await Product.findOne({ where: { sku: data.sku.toUpperCase() } });
    if (existing) throw ApiError.conflict('A product with that SKU already exists');
  }
  for (const k of WRITABLE) if (data[k] !== undefined) product[k] = data[k];
  const refs = await catalogService.resolveProductRefs(data);
  for (const [k, v] of Object.entries(refs)) product[k] = v;
  // Re-homing a product to a different warehouse only changes which location
  // it's labeled/defaulted to — existing StockLevel rows (wherever they are)
  // are untouched, same as a legacy product that already had stock in more
  // than one warehouse.
  if (data.warehouse) {
    const warehouse = await require('./warehouseService').getWarehouseById(data.warehouse);
    product.warehouse = warehouse.id;
  }
  await product.save();
  return getProductById(id);
}

async function deleteProduct(id) {
  const { Product, StockLevel } = initializeModels();
  await findProductOrThrow(id);
  const hasStock = await StockLevel.count({ where: { product: id, quantity: { [Op.ne]: 0 } } });
  if (hasStock) throw ApiError.badRequest('Product still has stock and cannot be deleted');
  // Remove the leftover zero-quantity stock rows so no orphans linger.
  await StockLevel.destroy({ where: { product: id } });
  await Product.destroy({ where: { id } });
}

// Current on-hand quantity for a product at a warehouse (summed across all
// warehouses when none is given). A cheap lookup the stock-adjust screen uses.
async function getStock(id, warehouse) {
  const { StockLevel } = initializeModels();
  await findProductOrThrow(id); // 404 if the product doesn't exist
  const where = { product: id };
  if (warehouse && isValidId(warehouse)) where.warehouse = warehouse;
  const row = await StockLevel.findOne({
    attributes: [[fn('SUM', col('quantity')), 'quantity']],
    where,
    raw: true,
  });
  return row && row.quantity !== null ? normalizeQuantity(row.quantity) : 0;
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
 * Returns the product and the resulting on-hand quantity (`newQty`). Runs in
 * one transaction so the stock level, movement log, and journal entry never
 * drift out of step.
 */
async function adjustStock(
  id,
  { warehouse, type, quantity, delta, unitCost, note = '', createdBy },
) {
  const { StockLevel } = initializeModels();

  const { newQty } = await getPostgres().transaction(async (transaction) => {
    const product = await findProductOrThrow(id, transaction);

    // The id is shape-validated by the route, but a well-formed id that points at
    // no warehouse would still create stock + a journal entry against a ghost
    // location. Confirm it actually exists (throws 404 otherwise). A product
    // can hold stock in more than one warehouse (via StockLevel), so any real
    // warehouse is a valid adjustment target, not just the product's own.
    const wh = await require('./warehouseService').getWarehouseById(warehouse, transaction);

    const level = await StockLevel.findOne({
      where: { product: product.id, warehouse: wh.id },
      transaction,
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
    if (signedDelta === 0) return { newQty: currentQty };

    // Positive changes need a unit cost; default to the catalog purchase price.
    const cost =
      signedDelta > 0
        ? unitCost !== undefined && unitCost !== null
          ? unitCost
          : product.purchasePrice || 0
        : 0;

    const valueDelta = await stockService.adjustStock(
      product.id,
      wh.id,
      signedDelta,
      cost,
      { refType: 'ADJUST', refNo: `ADJ-${product.sku || product.id}` },
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
        createdBy: createdBy ? createdBy.id : null,
        transaction,
      });
    }

    return { newQty: normalizeQuantity(currentQty + signedDelta) };
  });

  return { product: await getProductById(id), newQty };
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
