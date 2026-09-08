const { QueryTypes } = require('sequelize');
const { getPostgres } = require('../db/postgres');
const { isValidId } = require('../db/id');
const journalService = require('./journalService');
const stockService = require('./stockService');
const { ACCOUNT, naturalBalance } = require('../utils/finance');
const { resolveWarehouseScope, actorStoreId } = require('../utils/storeScope');

/**
 * Dashboard overview: the handful of headline figures and mini-charts shown on
 * the home screen, gathered in one round-trip so the client makes a single
 * request. All money is paisa; the controller converts to rupees.
 *
 * Two scopes are mixed here on purpose:
 *   - Sales-derived cards (today / month / total sales, trend, top products)
 *     and stock value respect the optional `warehouse`/`store` filter.
 *   - Ledger-derived cards (expenses, receivables, payables) are business-wide
 *     — the ledger is not dimensioned by warehouse — so they ignore it.
 *
 * Day boundaries are computed in UTC so the trend buckets line up
 * consistently regardless of server timezone.
 */

const TREND_DAYS = 30;
const TOP_PRODUCTS = 5;

// Builds a `sales` WHERE fragment for the store/warehouse scope: a store
// filters on the sale's own `store_id`; otherwise a resolved warehouse-id
// list filters on `warehouse_id` (an empty list — a real store with no
// warehouses — correctly matches nothing via `IN (NULL)`); no scope at all
// leaves every sale in view. `alias` is the table alias to qualify the
// column with (e.g. `'s.'` when sales is joined under that alias).
function scopeCondition(storeId, warehouseIds, alias = '') {
  if (storeId) return { clause: `${alias}store_id = :storeId`, replacements: { storeId } };
  if (warehouseIds)
    return { clause: `${alias}warehouse_id IN (:warehouseIds)`, replacements: { warehouseIds } };
  return { clause: 'TRUE', replacements: {} };
}

// Sum of Sale.total (paisa) matching the given filter, optionally from a date.
async function salesTotal(scope, fromDate) {
  const conditions = [scope.clause];
  const replacements = { ...scope.replacements };
  if (fromDate) {
    conditions.push('date >= :from');
    replacements.from = fromDate;
  }
  const [row] = await getPostgres().query(
    `SELECT COALESCE(SUM(total), 0) AS total FROM sales WHERE ${conditions.join(' AND ')}`,
    { replacements, type: QueryTypes.SELECT },
  );
  return row.total;
}

// Daily Sale.total for the last TREND_DAYS days, zero-filled so the client
// gets a continuous series. Keys are UTC YYYY-MM-DD.
async function salesTrend(scope, fromDate) {
  const rows = await getPostgres().query(
    `SELECT TO_CHAR(date AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS day, COALESCE(SUM(total), 0) AS total
     FROM sales
     WHERE ${scope.clause} AND date >= :from
     GROUP BY day`,
    { replacements: { ...scope.replacements, from: fromDate }, type: QueryTypes.SELECT },
  );

  const byDay = new Map(rows.map((r) => [r.day, r.total]));
  const series = [];
  for (let i = TREND_DAYS - 1; i >= 0; i -= 1) {
    const d = new Date(fromDate.getTime() + (TREND_DAYS - 1 - i) * 86400000);
    const key = d.toISOString().slice(0, 10);
    series.push({ date: key, total: byDay.get(key) || 0 });
  }
  return series;
}

// Best-selling products by revenue (sum of line totals, paisa).
async function topProducts(storeId, warehouseIds) {
  const scope = scopeCondition(storeId, warehouseIds, 's.');
  const rows = await getPostgres().query(
    `SELECT si.product_id AS product, MIN(si.name) AS name,
            SUM(si.quantity) AS quantity, SUM(si.line_total) AS revenue
     FROM sale_items si
     JOIN sales s ON s.id = si.sale_id
     WHERE ${scope.clause}
     GROUP BY si.product_id
     ORDER BY revenue DESC
     LIMIT ${TOP_PRODUCTS}`,
    { replacements: scope.replacements, type: QueryTypes.SELECT },
  );
  return rows.map((r) => ({
    product: r.product,
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
 * Build the full dashboard payload (paisa). `store` (takes precedence) and
 * `warehouse` are both optional.
 */
async function summary({ warehouse, store, actor } = {}) {
  // Sales (and the COGS/expense entries they post) record their own
  // storefront directly — prefer that over the looser warehouse-membership
  // scoping (two stores can share a warehouse). Stock valuation has no direct
  // store link (Products own a single warehouse, not a store), so it always
  // resolves through warehouse membership.
  const { warehouseIds } = await resolveWarehouseScope({ warehouse, store, actor });
  // A store-restricted actor's own store always wins over the query param.
  const validStore = actorStoreId(actor) || (store && isValidId(store) ? store : null);
  const scope = scopeCondition(validStore, validStore ? null : warehouseIds);
  const ledgerScope = validStore ? { store: validStore } : {};

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
    salesTotal(scope, startOfToday),
    salesTotal(scope, startOfMonth),
    salesTotal(scope),
    stockService.valuation({ warehouseIds }).then((v) => v.total),
    journalService
      .accountTotals(ACCOUNT.COGS, null, ledgerScope)
      .then((t) => naturalBalance(ACCOUNT.COGS, t.debit, t.credit)),
    journalService
      .accountTotals(ACCOUNT.OPERATING_EXPENSE, null, ledgerScope)
      .then((t) => naturalBalance(ACCOUNT.OPERATING_EXPENSE, t.debit, t.credit)),
    outstanding(ACCOUNT.AR),
    outstanding(ACCOUNT.AP),
    salesTrend(scope, trendStart),
    topProducts(validStore, validStore ? null : warehouseIds),
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
