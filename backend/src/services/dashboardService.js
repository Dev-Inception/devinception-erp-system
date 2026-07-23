const mongoose = require('mongoose');
const Sale = require('../models/saleModel');
const journalService = require('./journalService');
const stockService = require('./stockService');
const { ACCOUNT, naturalBalance } = require('../utils/finance');

/**
 * Dashboard overview: the handful of headline figures and mini-charts shown on
 * the home screen, gathered in one round-trip so the client makes a single
 * request. All money is paisa; the controller converts to rupees.
 *
 * Two scopes are mixed here on purpose:
 *   - Sales-derived cards (today / month / total sales, trend, top products)
 *     and stock value respect the optional `warehouse` filter.
 *   - Ledger-derived cards (expenses, receivables, payables) are business-wide
 *     — the ledger is not dimensioned by warehouse — so they ignore it.
 *
 * Day boundaries are computed in UTC so the trend buckets line up with
 * MongoDB's `$dateToString` (which also defaults to UTC).
 */

const TREND_DAYS = 30;
const TOP_PRODUCTS = 5;

// Optional warehouse match for Sale aggregations. Returns {} when absent or
// malformed so a bad query param degrades to "all warehouses" rather than
// erroring.
function saleWarehouseMatch(warehouse) {
  if (warehouse && mongoose.isValidObjectId(warehouse)) {
    return { warehouse: new mongoose.Types.ObjectId(warehouse) };
  }
  return {};
}

// Sum of Sale.total (paisa) matching the given filter.
async function salesTotal(match) {
  const rows = await Sale.aggregate([
    { $match: match },
    { $group: { _id: null, total: { $sum: '$total' } } },
  ]);
  return rows[0] ? rows[0].total : 0;
}

// Daily Sale.total for the last TREND_DAYS days, zero-filled so the client gets
// a continuous series. Keys are UTC YYYY-MM-DD.
async function salesTrend(whMatch, fromDate) {
  const rows = await Sale.aggregate([
    { $match: { ...whMatch, date: { $gte: fromDate } } },
    {
      $group: {
        _id: { $dateToString: { format: '%Y-%m-%d', date: '$date' } },
        total: { $sum: '$total' },
      },
    },
  ]);

  const byDay = new Map(rows.map((r) => [r._id, r.total]));
  const series = [];
  for (let i = TREND_DAYS - 1; i >= 0; i -= 1) {
    const d = new Date(fromDate.getTime() + (TREND_DAYS - 1 - i) * 86400000);
    const key = d.toISOString().slice(0, 10);
    series.push({ date: key, total: byDay.get(key) || 0 });
  }
  return series;
}

// Best-selling products by revenue (sum of line totals, paisa).
async function topProducts(whMatch) {
  const rows = await Sale.aggregate([
    { $match: whMatch },
    { $unwind: '$items' },
    {
      $group: {
        _id: '$items.product',
        name: { $first: '$items.name' },
        quantity: { $sum: '$items.quantity' },
        revenue: { $sum: '$items.lineTotal' },
      },
    },
    { $sort: { revenue: -1 } },
    { $limit: TOP_PRODUCTS },
  ]);

  return rows.map((r) => ({
    product: r._id,
    name: r.name,
    quantity: r.quantity,
    revenue: r.revenue,
  }));
}

// Sum of the positive natural balances under an account kind (paisa): total
// money owed to us (AR) or by us (AP), ignoring any party in credit.
async function outstanding(account) {
  const balances = await journalService.balancesByRef(account);
  let sum = 0;
  for (const bal of balances.values()) {
    if (bal > 0) sum += bal;
  }
  return sum;
}

/**
 * Build the full dashboard payload (paisa). `warehouse` is optional.
 */
async function summary({ warehouse } = {}) {
  const whMatch = saleWarehouseMatch(warehouse);

  const now = new Date();
  const startOfToday = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  const startOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const trendStart = new Date(startOfToday.getTime() - (TREND_DAYS - 1) * 86400000);

  const [
    todaySales,
    monthSales,
    totalRevenue,
    stockVal,
    cogs,
    operatingExpenses,
    receivables,
    payables,
    trend,
    products,
  ] = await Promise.all([
    salesTotal({ ...whMatch, date: { $gte: startOfToday } }),
    salesTotal({ ...whMatch, date: { $gte: startOfMonth } }),
    salesTotal({ ...whMatch }),
    stockService.valuation({ warehouse }).then((v) => v.total),
    journalService
      .accountTotals(ACCOUNT.COGS)
      .then((t) => naturalBalance(ACCOUNT.COGS, t.debit, t.credit)),
    journalService
      .accountTotals(ACCOUNT.OPERATING_EXPENSE)
      .then((t) => naturalBalance(ACCOUNT.OPERATING_EXPENSE, t.debit, t.credit)),
    outstanding(ACCOUNT.AR),
    outstanding(ACCOUNT.AP),
    salesTrend(whMatch, trendStart),
    topProducts(whMatch),
  ]);

  return {
    cards: {
      todaySales,
      monthSales,
      totalRevenue,
      stockValue: stockVal,
      expenses: cogs + operatingExpenses,
      receivables,
      payables,
    },
    salesTrend: trend,
    topProducts: products,
  };
}

module.exports = { summary };
