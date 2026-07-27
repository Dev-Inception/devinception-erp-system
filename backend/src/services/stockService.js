const { Op } = require('sequelize');
const { initializeModels } = require('../db/models');
const { getPostgres } = require('../db/postgres');
const ApiError = require('../utils/ApiError');
const {
  normalizeQuantity,
  requirePositiveQuantity,
  requireNonZeroQuantity,
} = require('../utils/quantity');
const { StockLevel, StockMovement, Warehouse, Product, Unit } = initializeModels();

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
async function ensureDefaultWarehouse({ transaction } = {}) {
  let wh = await Warehouse.findOne({ where: { isDefault: true }, transaction });
  if (!wh) {
    wh = await Warehouse.create({ name: 'Main Store', isDefault: true }, { transaction });
  }
  return wh;
}

async function getLevel(product, warehouse, { transaction, lock } = {}) {
  let level = await StockLevel.findOne({
    where: { product, warehouse },
    transaction,
    lock,
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
 * (paisa) for the Dr Inventory journal line.
 */
async function receiveStock(
  product,
  warehouse,
  qty,
  unitCost,
  ref = {},
  exactTotal = null,
  outerTransaction = null,
) {
  const quantity = requirePositiveQuantity(qty, 'Receive quantity must be positive');
  const write = async (transaction) => {
    const level = await getLevel(product, warehouse, {
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
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
  };
  if (outerTransaction) return write(outerTransaction);
  return getPostgres().transaction(write);
}

/**
 * Issue `qty` units out of stock at the current average cost. Refuses to
 * oversell. Logs an OUT movement and returns the COGS (paisa) for the
 * Dr COGS / Cr Inventory journal lines.
 */
async function issueStock(product, warehouse, qty, ref = {}, outerTransaction = null) {
  const quantity = requirePositiveQuantity(qty, 'Issue quantity must be positive');
  const write = async (transaction) => {
    const level = await StockLevel.findOne({
      where: { product, warehouse },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    const available = level ? normalizeQuantity(level.quantity) : 0;
    if (!level || available < quantity) {
      throw ApiError.badRequest('Insufficient stock for one or more items');
    }

    level.quantity = normalizeQuantity(available - quantity);
    const cogs = calculateIssueCost(level.quantity, quantity, level.avgCost);
    await level.save({ transaction });
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
  };
  if (outerTransaction) return write(outerTransaction);
  return getPostgres().transaction(write);
}

/**
 * Adjust stock by a signed delta (opening balance or correction). Positive
 * receives at `unitCost`; negative issues at the current average. Returns the
 * signed change in inventory value (paisa) so the caller can post the
 * balancing journal line against equity.
 */
async function adjustStock(product, warehouse, delta, unitCost, ref = {}, transaction = null) {
  const quantity = requireNonZeroQuantity(delta, 'Adjustment quantity cannot be zero');
  if (quantity > 0) {
    const value = await receiveStock(
      product,
      warehouse,
      quantity,
      unitCost,
      { ...ref, refType: ref.refType || 'ADJUST' },
      null,
      transaction,
    );
    return value;
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

// Total inventory value (paisa), optionally for one warehouse, with per-row
// detail for the Stock Valuation report.
async function valuation({ warehouse } = {}) {
  const where = warehouse ? { warehouse } : {};
  const levels = await StockLevel.findAll({
    where,
    include: [
      {
        model: Product,
        as: 'productInfo',
        include: [{ model: Unit, as: 'unitInfo' }],
      },
      { model: Warehouse, as: 'warehouseInfo' },
    ],
  });

  const rows = levels
    .filter(
      (l) =>
        l.productInfo &&
        (!warehouse ||
          !l.productInfo.warehouse ||
          String(l.productInfo.warehouse) === String(warehouse)),
    )
    .map((l) => {
      const quantity = normalizeQuantity(l.quantity);
      return {
        product: {
          ...l.productInfo.toJSON(),
          unit: l.productInfo.unitInfo ? l.productInfo.unitInfo.toJSON() : null,
        },
        warehouse: l.warehouseInfo ? l.warehouseInfo.toJSON() : null,
        quantity,
        avgCost: l.avgCost,
        value: Math.round(quantity * l.avgCost),
      };
    });

  // Include active catalog products that have no StockLevel in the requested
  // scope. A zero-stock product is still important report detail, especially
  // when it is at/below its reorder threshold.
  const represented = rows.map((row) => row.product._id);
  const productWhere = { isActive: true };
  if (warehouse) productWhere.warehouse = warehouse;
  if (represented.length) productWhere.id = { [Op.notIn]: represented };
  const missingProducts = await Product.findAll({
    where: productWhere,
    include: [{ model: Unit, as: 'unitInfo' }],
  });
  const selectedWarehouse = warehouse ? await Warehouse.findByPk(warehouse) : null;
  for (const product of missingProducts) {
    rows.push({
      product: {
        ...product.toJSON(),
        unit: product.unitInfo ? product.unitInfo.toJSON() : null,
      },
      warehouse: selectedWarehouse ? selectedWarehouse.toJSON() : null,
      quantity: 0,
      avgCost: 0,
      value: 0,
    });
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
