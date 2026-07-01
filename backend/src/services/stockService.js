const StockLevel = require('../models/stockLevelModel');
const StockMovement = require('../models/stockMovementModel');
const Warehouse = require('../models/warehouseModel');
const ApiError = require('../utils/ApiError');

/**
 * Inventory mechanics: moving-average costing. Receiving stock blends the new
 * cost into the running average; issuing stock leaves at that average and
 * yields the cost of goods sold (COGS). All costs are integer paisa per unit.
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

/**
 * Receive `qty` units at `unitCost` (paisa). Recomputes the moving-average
 * cost and logs an IN movement. Returns the total cost added to inventory
 * (paisa) for the Dr Inventory journal line.
 */
async function receiveStock(product, warehouse, qty, unitCost, ref = {}) {
  if (qty <= 0) throw ApiError.badRequest('Receive quantity must be positive');

  const level = await getLevel(product, warehouse);
  const oldQty = level.quantity;
  const oldValue = Math.round(oldQty * level.avgCost);
  const inValue = Math.round(qty * unitCost);
  const newQty = oldQty + qty;

  level.quantity = newQty;
  // Blend; if stock was zero/negative, adopt the incoming cost outright.
  level.avgCost = newQty > 0 ? Math.round((oldValue + inValue) / newQty) : unitCost;
  await level.save();

  await StockMovement.create({
    product,
    warehouse,
    type: 'IN',
    quantity: qty,
    unitCost,
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
  if (qty <= 0) throw ApiError.badRequest('Issue quantity must be positive');

  // Decrement atomically, and only when enough stock exists, so concurrent
  // issues can't oversell via a read-modify-write race (the conditional filter
  // + $inc is applied as a single atomic operation by MongoDB). avgCost is
  // unchanged by an issue, so the returned (post-update) doc still carries it.
  const level = await StockLevel.findOneAndUpdate(
    { product, warehouse, quantity: { $gte: qty } },
    { $inc: { quantity: -qty } },
    { new: true },
  );
  if (!level) {
    throw ApiError.badRequest('Insufficient stock for one or more items');
  }

  const cogs = Math.round(qty * level.avgCost);

  await StockMovement.create({
    product,
    warehouse,
    type: 'OUT',
    quantity: -qty,
    unitCost: level.avgCost,
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
  if (delta === 0) throw ApiError.badRequest('Adjustment quantity cannot be zero');
  if (delta > 0) {
    const value = await receiveStock(product, warehouse, delta, unitCost, {
      ...ref,
      refType: ref.refType || 'ADJUST',
    });
    return value;
  }
  const cogs = await issueStock(product, warehouse, -delta, {
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
      select: 'name sku unit',
      populate: { path: 'unit', select: 'name abbreviation' },
    })
    .populate('warehouse', 'name')
    .lean();

  const rows = levels
    .filter((l) => l.product)
    .map((l) => ({
      product: l.product,
      warehouse: l.warehouse,
      quantity: l.quantity,
      avgCost: l.avgCost,
      value: Math.round(l.quantity * l.avgCost),
    }));

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
};
