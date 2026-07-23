const StockLevel = require('../models/stockLevelModel');
const StockMovement = require('../models/stockMovementModel');
const Warehouse = require('../models/warehouseModel');
const Product = require('../models/productModel');
const ApiError = require('../utils/ApiError');
const {
  QUANTITY_DECIMALS,
  normalizeQuantity,
  requirePositiveQuantity,
  requireNonZeroQuantity,
} = require('../utils/quantity');

/**
 * Inventory mechanics: moving-average costing. Receiving stock blends the new
 * cost into the running average; issuing stock leaves at that average and
 * yields the cost of goods sold (COGS). Posted totals are integer paisa; the
 * internal per-unit average may use sub-paisa precision to preserve them.
 *
 * These functions are called from within the purchase/sale services, which
 * also post the matching journal entry, so stock and the ledger stay in step.
 */

// The default warehouse, created on first use. Used when none is specified.
async function ensureDefaultWarehouse() {
  let wh = await Warehouse.findOne({ isDefault: true });
  if (!wh) wh = await Warehouse.create({ name: 'Main Store', isDefault: true });
  return wh;
}

async function getLevel(product, warehouse) {
  let level = await StockLevel.findOne({ product, warehouse });
  if (!level) level = await StockLevel.create({ product, warehouse, quantity: 0, avgCost: 0 });
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
 * (paisa) for the Dr Inventory journal line.
 */
async function receiveStock(product, warehouse, qty, unitCost, ref = {}, exactTotal = null) {
  const quantity = requirePositiveQuantity(qty, 'Receive quantity must be positive');

  const level = await getLevel(product, warehouse);
  const inValue = exactTotal === null ? Math.round(quantity * unitCost) : Number(exactTotal);
  if (!Number.isSafeInteger(inValue) || inValue < 0) {
    throw ApiError.badRequest('Received stock value must be a non-negative monetary amount');
  }
  const next = receiptCostState(level.quantity, level.avgCost, quantity, inValue);

  level.quantity = next.quantity;
  level.avgCost = next.avgCost;
  await level.save();

  await StockMovement.create({
    product,
    warehouse,
    type: 'IN',
    quantity,
    unitCost: inValue / quantity,
    totalCost: inValue,
    refType: ref.refType || '',
    refNo: ref.refNo || '',
    date: ref.date || new Date(),
  });

  return inValue;
}

/**
 * Issue `qty` units out of stock at the current average cost. Refuses to
 * oversell. Logs an OUT movement and returns the COGS (paisa) for the
 * Dr COGS / Cr Inventory journal lines.
 */
async function issueStock(product, warehouse, qty, ref = {}) {
  const quantity = requirePositiveQuantity(qty, 'Issue quantity must be positive');

  // Decrement atomically, and only when enough stock exists, so concurrent
  // issues cannot oversell. Both the availability check and subtraction use
  // the same fixed quantity precision to eliminate binary-float residues.
  // avgCost is unchanged, so the returned (post-update) doc still carries it.
  const level = await StockLevel.findOneAndUpdate(
    {
      product,
      warehouse,
      $expr: { $gte: [{ $round: ['$quantity', QUANTITY_DECIMALS] }, quantity] },
    },
    [
      {
        $set: {
          quantity: {
            $round: [
              { $subtract: [{ $round: ['$quantity', QUANTITY_DECIMALS] }, quantity] },
              QUANTITY_DECIMALS,
            ],
          },
        },
      },
    ],
    { returnDocument: 'after', updatePipeline: true },
  );
  if (!level) {
    throw ApiError.badRequest('Insufficient stock for one or more items');
  }

  const cogs = calculateIssueCost(level.quantity, quantity, level.avgCost);

  await StockMovement.create({
    product,
    warehouse,
    type: 'OUT',
    quantity: -quantity,
    unitCost: level.avgCost,
    totalCost: cogs,
    refType: ref.refType || '',
    refNo: ref.refNo || '',
    date: ref.date || new Date(),
  });

  return cogs;
}

/**
 * Adjust stock by a signed delta (opening balance or correction). Positive
 * receives at `unitCost`; negative issues at the current average. Returns the
 * signed change in inventory value (paisa) so the caller can post the
 * balancing journal line against equity.
 */
async function adjustStock(product, warehouse, delta, unitCost, ref = {}) {
  const quantity = requireNonZeroQuantity(delta, 'Adjustment quantity cannot be zero');
  if (quantity > 0) {
    const value = await receiveStock(product, warehouse, quantity, unitCost, {
      ...ref,
      refType: ref.refType || 'ADJUST',
    });
    return value;
  }
  const cogs = await issueStock(product, warehouse, -quantity, {
    ...ref,
    refType: ref.refType || 'ADJUST',
  });
  return -cogs;
}

// Total inventory value (paisa), optionally for one warehouse, with per-row
// detail for the Stock Valuation report.
async function valuation({ warehouse } = {}) {
  const filter = {};
  if (warehouse) filter.warehouse = warehouse;

  const levels = await StockLevel.find(filter)
    .populate({
      path: 'product',
      select: 'name sku unit minStock warehouse',
      populate: { path: 'unit', select: 'name abbreviation' },
    })
    .populate('warehouse', 'name location address isDefault')
    .lean();

  const rows = levels
    .filter(
      (l) =>
        l.product &&
        (!warehouse || !l.product.warehouse || String(l.product.warehouse) === String(warehouse)),
    )
    .map((l) => {
      const quantity = normalizeQuantity(l.quantity);
      return {
        product: l.product,
        warehouse: l.warehouse,
        quantity,
        avgCost: l.avgCost,
        value: Math.round(quantity * l.avgCost),
      };
    });

  // Include active catalog products that have no StockLevel in the requested
  // scope. A zero-stock product is still important report detail, especially
  // when it is at/below its reorder threshold.
  const represented = rows.map((row) => row.product._id);
  const missingProducts = await Product.find({
    isActive: true,
    ...(warehouse ? { warehouse } : {}),
    ...(represented.length ? { _id: { $nin: represented } } : {}),
  })
    .select('name sku unit minStock')
    .populate('unit', 'name abbreviation')
    .lean();
  const selectedWarehouse = warehouse
    ? await Warehouse.findById(warehouse).select('name location address isDefault').lean()
    : null;
  for (const product of missingProducts) {
    rows.push({ product, warehouse: selectedWarehouse, quantity: 0, avgCost: 0, value: 0 });
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
