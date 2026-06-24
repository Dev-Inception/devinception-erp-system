const Sale = require("../models/saleModel");
const GoodsPurchase = require("../models/goodsPurchaseModel");
const ApiError = require("../utils/ApiError");
const { ACCOUNT } = require("../utils/finance");
const journalService = require("./journalService");
const stockService = require("./stockService");

/**
 * Reporting: date-range aggregations over the transactional data and the
 * ledger. All figures are paisa; the controller converts to rupees and the
 * frontend renders / exports them (Print / CSV).
 */

function dateFilter({ from, to }) {
  const f = {};
  if (from || to) {
    f.date = {};
    if (from) f.date.$gte = new Date(from);
    if (to) f.date.$lte = new Date(to);
  }
  return f;
}

// Sales report: one row per sale + cash/online/total summary.
async function salesReport({ from, to }) {
  const sales = await Sale.find(dateFilter({ from, to })).sort({ date: -1, createdAt: -1 }).lean();

  const rows = sales.map((s) => ({
    number: s.number,
    date: s.date,
    customer: s.customerName,
    paymentMethod: s.paymentMethod,
    cash: s.cashAmount,
    online: s.onlineAmount,
    credit: s.creditAmount,
    total: s.total,
  }));

  const summary = rows.reduce(
    (acc, r) => {
      acc.count += 1;
      acc.cash += r.cash;
      acc.online += r.online;
      acc.credit += r.credit;
      acc.total += r.total;
      return acc;
    },
    { count: 0, cash: 0, online: 0, credit: 0, total: 0 }
  );

  return { rows, summary };
}

// Purchases report: one row per purchase + total/paid/balance summary.
async function purchasesReport({ from, to }) {
  const purchases = await GoodsPurchase.find(dateFilter({ from, to }))
    .populate("vendor", "name")
    .sort({ date: -1, createdAt: -1 })
    .lean();

  const rows = purchases.map((p) => ({
    number: p.number,
    date: p.date,
    vendor: p.vendor ? p.vendor.name : "—",
    total: p.total,
    paid: p.paid,
    balance: p.balance,
  }));

  const summary = rows.reduce(
    (acc, r) => {
      acc.count += 1;
      acc.total += r.total;
      acc.paid += r.paid;
      acc.balance += r.balance;
      return acc;
    },
    { count: 0, total: 0, paid: 0, balance: 0 }
  );

  return { rows, summary };
}

// Stock valuation: quantity × moving-average cost per product.
async function stockValuationReport({ warehouse }) {
  const { rows, total } = await stockService.valuation({ warehouse });
  return {
    rows: rows.map((r) => ({
      product: r.product.name,
      sku: r.product.sku || "",
      unit: r.product.unit || "",
      warehouse: r.warehouse ? r.warehouse.name : "",
      quantity: r.quantity,
      avgCost: r.avgCost,
      value: r.value,
    })),
    summary: { count: rows.length, total },
  };
}

/**
 * Profit & Loss for a period, derived from the ledger:
 *   Revenue (net Sales) − COGS = Gross profit.
 * No operating-expense accounts are modelled yet, so net = gross.
 */
async function profitAndLossReport({ from, to }) {
  const range = {
    from: from ? new Date(from) : undefined,
    to: to ? new Date(to) : undefined,
  };
  const [sales, cogs] = await Promise.all([
    journalService.accountTotals(ACCOUNT.SALES, null, range),
    journalService.accountTotals(ACCOUNT.COGS, null, range),
  ]);

  const revenue = sales.credit - sales.debit; // income is credit-normal
  const costOfGoodsSold = cogs.debit - cogs.credit; // expense is debit-normal
  const grossProfit = revenue - costOfGoodsSold;

  return {
    revenue,
    costOfGoodsSold,
    grossProfit,
    netProfit: grossProfit,
  };
}

const REPORTS = {
  sales: salesReport,
  purchases: purchasesReport,
  "stock-valuation": stockValuationReport,
  "profit-loss": profitAndLossReport,
};

async function runReport(type, params) {
  const fn = REPORTS[type];
  if (!fn) throw ApiError.badRequest(`Unknown report type: ${type}`);
  return fn(params);
}

module.exports = {
  salesReport,
  purchasesReport,
  stockValuationReport,
  profitAndLossReport,
  runReport,
};
