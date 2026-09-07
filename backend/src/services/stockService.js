const { QueryTypes, Op } = require('sequelize');
const { getPostgres } = require('../db/postgres');
const { initializeModels } = require('../db/models');
const ApiError = require('../utils/ApiError');
const {
  QUANTITY_DECIMALS,
  normalizeQuantity,
  requirePositiveQuantity,
  requireNonZeroQuantity,
} = require('../utils/quantity');
const { warehouseWhere } = require('../utils/storeScope');

/**
 * Inventory mechanics: moving-average costing. Receiving stock blends the new
 * cost into the running average; issuing stock leaves at that average and
 * yields the cost of goods sold (COGS). Posted totals are integer paisa; the
 * internal per-unit average may use sub-paisa precision to preserve them.
 *
 * These functions are called from within the purchase/sale services inside
 * one shared transaction that also posts the matching journal entry, so
 * stock and the ledger stay in step atomically.
 */

// The default warehouse, created on first use. Used when none is specified.
async function ensureDefaultWarehouse(transaction) {
  const { Warehouse } = initializeModels();
  let wh = await Warehouse.findOne({ where: { isDefault: true }, transaction });
  if (!wh) wh = await Warehouse.create({ name: 'Main Store', isDefault: true }, { transaction });
  return wh;
}

// `lock: true` takes a row lock (SELECT ... FOR UPDATE) on an existing level
// so a read-modify-write (receive/adjust) can't lose a concurrent update.
async function getLevel(product, warehouse, { transaction, lock = false } = {}) {
  const { StockLevel } = initializeModels();
  let level = await StockLevel.findOne({
    where: { product, warehouse },
    transaction,
    lock: lock ? transaction.LOCK.UPDATE : undefined,
  });
  if (!level) {
    level = await StockLevel.create(
      { product, warehouse, quantity: 0, avgCost: 0 },
      { transaction },
    );
  }
  return level;
}

// Return the precise moving-average rate whose rounded extended value equals
// the integer-paisa inventory value. The rate itself may contain a fraction of
// a paisa; every posted/serialized total remains integer paisa.
function receiptCostState(oldQty, oldAvgCost, receivedQty, receivedValue) {
  const normalizedOldQty = normalizeQuantity(oldQty);
  const normalizedReceivedQty = normalizeQuantity(receivedQty);
  const oldValue = Math.round(normalizedOldQty * oldAvgCost);
  const quantity = normalizeQuantity(normalizedOldQty + normalizedReceivedQty);
  const value = oldValue + receivedValue;
  return {
    quantity,
    value,
    avgCost: quantity > 0 ? value / quantity : 0,
  };
}

// Allocate the rounded moving-average value across issues by taking the
// difference between stock value immediately before and after this issue.
// Successive issues therefore telescope exactly to the original receipt value
// (e.g. 100 paisa over 3 units becomes COGS 33 + 34 + 33, never 99).
function calculateIssueCost(remainingQty, issuedQty, avgCost) {
  const remaining = normalizeQuantity(remainingQty);
  const issued = normalizeQuantity(issuedQty);
  const quantityBefore = normalizeQuantity(remaining + issued);
  const valueBefore = Math.round(quantityBefore * avgCost);
  const valueAfter = Math.round(remaining * avgCost);
  return valueBefore - valueAfter;
}

/**
 * Receive `qty` units at `unitCost` (paisa). Recomputes the moving-average
 * cost and logs an IN movement. Returns the total cost added to inventory
 * (paisa) for the Dr Inventory journal line. Must run inside a transaction —
 * the level is locked (FOR UPDATE) before its read-modify-write so concurrent
 * receipts against the same product/warehouse can't lose an update.
 */
async function receiveStock(
  product,
  warehouse,
  qty,
  unitCost,
  ref = {},
  exactTotal = null,
  transaction,
) {
  const { StockMovement } = initializeModels();
  const quantity = requirePositiveQuantity(qty, 'Receive quantity must be positive');

  const level = await getLevel(product, warehouse, { transaction, lock: true });
  const inValue = exactTotal === null ? Math.round(quantity * unitCost) : Number(exactTotal);
  if (!Number.isSafeInteger(inValue) || inValue < 0) {
    throw ApiError.badRequest('Received stock value must be a non-negative monetary amount');
  }
  const next = receiptCostState(level.quantity, level.avgCost, quantity, inValue);

  level.quantity = next.quantity;
  level.avgCost = next.avgCost;
  await level.save({ transaction });

  await StockMovement.create(
    {
      product,
      warehouse,
      type: 'IN',
      quantity,
      unitCost: inValue / quantity,
      totalCost: inValue,
      refType: ref.refType || '',
      refNo: ref.refNo || '',
      date: ref.date || new Date(),
    },
    { transaction },
  );

  return inValue;
}

/**
 * Issue `qty` units out of stock at the current average cost. Refuses to
 * oversell. Logs an OUT movement and returns the COGS (paisa) for the
 * Dr COGS / Cr Inventory journal lines. Must run inside a transaction.
 */
async function issueStock(product, warehouse, qty, ref = {}, transaction) {
  const { StockMovement } = initializeModels();
  const quantity = requirePositiveQuantity(qty, 'Issue quantity must be positive');

  // Single conditional UPDATE, so concurrent issues against the same row can
  // never oversell — Postgres's row-level lock on the UPDATE target makes
  // this atomic without a separate SELECT ... FOR UPDATE.
  const [rows] = await getPostgres().query(
    `UPDATE stock_levels
     SET quantity = ROUND(quantity - :qty, ${QUANTITY_DECIMALS})
     WHERE product_id = :product AND warehouse_id = :warehouse
       AND ROUND(quantity, ${QUANTITY_DECIMALS}) >= :qty
     RETURNING quantity, avg_cost AS "avgCost"`,
    { replacements: { product, warehouse, qty: quantity }, transaction, type: QueryTypes.RAW },
  );
  const level = rows[0];
  if (!level) {
    throw ApiError.badRequest('Insufficient stock for one or more items');
  }

  const cogs = calculateIssueCost(level.quantity, quantity, level.avgCost);

  await StockMovement.create(
    {
      product,
      warehouse,
      type: 'OUT',
      quantity: -quantity,
      unitCost: level.avgCost,
      totalCost: cogs,
      refType: ref.refType || '',
      refNo: ref.refNo || '',
      date: ref.date || new Date(),
    },
    { transaction },
  );

  return cogs;
}

/**
 * Adjust stock by a signed delta (opening balance or correction). Positive
 * receives at `unitCost`; negative issues at the current average. Returns the
 * signed change in inventory value (paisa) so the caller can post the
 * balancing journal line against equity.
 */
async function adjustStock(product, warehouse, delta, unitCost, ref = {}, transaction) {
  const quantity = requireNonZeroQuantity(delta, 'Adjustment quantity cannot be zero');
  if (quantity > 0) {
    return receiveStock(
      product,
      warehouse,
      quantity,
      unitCost,
      { ...ref, refType: ref.refType || 'ADJUST' },
      null,
      transaction,
    );
  }
  const cogs = await issueStock(
    product,
    warehouse,
    -quantity,
    { ...ref, refType: ref.refType || 'ADJUST' },
    transaction,
  );
  return -cogs;
}

// Total inventory value (paisa), optionally scoped to one or more warehouses,
// with per-row detail for the Stock Valuation report.
async function valuation({ warehouseIds = null } = {}) {
  const { StockLevel, Product, Warehouse, Unit } = initializeModels();

  const levels = await StockLevel.findAll({
    where: warehouseWhere(warehouseIds),
    include: [
      {
        model: Product,
        as: 'productInfo',
        attributes: ['id', 'name', 'sku', 'unit', 'minStock', 'warehouse'],
        include: [{ model: Unit, as: 'unitInfo', attributes: ['id', 'name', 'abbreviation'] }],
      },
      {
        model: Warehouse,
        as: 'warehouseInfo',
        attributes: ['id', 'name', 'location', 'address', 'isDefault'],
      },
    ],
  });

  // `levels` is already correctly scoped by the where-clause above (on the
  // StockLevel's own `warehouse`) — a product can legitimately hold stock
  // outside its own declared warehouse, so that's the only scoping that
  // matters here. Only drop rows whose product was deleted.
  const rows = levels
    .filter((l) => l.productInfo)
    .map((l) => {
      const quantity = normalizeQuantity(l.quantity);
      return {
        product: l.productInfo,
        warehouse: l.warehouseInfo,
        quantity,
        avgCost: l.avgCost,
        value: Math.round(quantity * l.avgCost),
      };
    });

  // Include active catalog products that have no StockLevel in the requested
  // scope. A zero-stock product is still important report detail, especially
  // when it is at/below its reorder threshold.
  const represented = rows.map((row) => row.product.id);
  const missingProducts = await Product.findAll({
    where: {
      isActive: true,
      ...warehouseWhere(warehouseIds),
      ...(represented.length ? { id: { [Op.notIn]: represented } } : {}),
    },
    attributes: ['id', 'name', 'sku', 'unit', 'minStock', 'warehouse'],
    include: [
      {
        model: Warehouse,
        as: 'warehouseInfo',
        attributes: ['id', 'name', 'location', 'address', 'isDefault'],
      },
      { model: Unit, as: 'unitInfo', attributes: ['id', 'name', 'abbreviation'] },
    ],
  });
  for (const product of missingProducts) {
    rows.push({ product, warehouse: product.warehouseInfo, quantity: 0, avgCost: 0, value: 0 });
  }

  const total = rows.reduce((sum, r) => sum + r.value, 0);
  return { rows, total };
}

module.exports = {
  ensureDefaultWarehouse,
  getLevel,
  receiveStock,
  issueStock,
  adjustStock,
  valuation,
  receiptCostState,
  calculateIssueCost,
};
