const { Op, QueryTypes } = require('sequelize');
const { initializeModels } = require('../db/models');
const { getPostgres } = require('../db/postgres');
const { isValidId } = require('../db/id');
const journalService = require('./journalService');
const stockService = require('./stockService');
const { ACCOUNT, naturalBalance } = require('../utils/finance');

const { Sale } = initializeModels();
const TREND_DAYS = 30;
const TOP_PRODUCTS = 5;

function warehouseWhere(warehouse) {
  return warehouse && isValidId(warehouse) ? { warehouse } : {};
}

async function salesTotal(where) {
  return Number((await Sale.sum('total', { where })) || 0);
}

async function salesTrend(warehouse, fromDate) {
  const warehouseClause = warehouse ? 'AND warehouse_id = :warehouse' : '';
  const rows = await getPostgres().query(
    `SELECT TO_CHAR(date AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS day,
            SUM(total) AS total
       FROM sales
      WHERE date >= :fromDate ${warehouseClause}
      GROUP BY day`,
    { replacements: { fromDate, warehouse }, type: QueryTypes.SELECT },
  );
  const byDay = new Map(rows.map((row) => [row.day, Number(row.total)]));
  const series = [];
  for (let index = 0; index < TREND_DAYS; index += 1) {
    const date = new Date(fromDate.getTime() + index * 86400000);
    const key = date.toISOString().slice(0, 10);
    series.push({ date: key, total: byDay.get(key) || 0 });
  }
  return series;
}

async function topProducts(warehouse) {
  const warehouseClause = warehouse ? 'WHERE s.warehouse_id = :warehouse' : '';
  const rows = await getPostgres().query(
    `SELECT si.product_id AS product, MIN(si.name) AS name,
            SUM(si.quantity) AS quantity, SUM(si.line_total) AS revenue
       FROM sale_items si
       JOIN sales s ON s.id = si.sale_id
       ${warehouseClause}
      GROUP BY si.product_id
      ORDER BY revenue DESC
      LIMIT :limit`,
    {
      replacements: { warehouse, limit: TOP_PRODUCTS },
      type: QueryTypes.SELECT,
    },
  );
  return rows.map((row) => ({
    ...row,
    quantity: Number(row.quantity),
    revenue: Number(row.revenue),
  }));
}

async function outstanding(account) {
  const balances = await journalService.balancesByRef(account);
  return [...balances.values()].reduce((sum, balance) => sum + Math.max(balance, 0), 0);
}

async function summary({ warehouse } = {}) {
  const scopedWarehouse = warehouse && isValidId(warehouse) ? warehouse : null;
  const baseWhere = warehouseWhere(scopedWarehouse);
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
    salesTotal({ ...baseWhere, date: { [Op.gte]: startOfToday } }),
    salesTotal({ ...baseWhere, date: { [Op.gte]: startOfMonth } }),
    salesTotal(baseWhere),
    stockService.valuation({ warehouse: scopedWarehouse }).then((value) => value.total),
    journalService
      .accountTotals(ACCOUNT.COGS)
      .then((totals) => naturalBalance(ACCOUNT.COGS, totals.debit, totals.credit)),
    journalService
      .accountTotals(ACCOUNT.OPERATING_EXPENSE)
      .then((totals) => naturalBalance(ACCOUNT.OPERATING_EXPENSE, totals.debit, totals.credit)),
    outstanding(ACCOUNT.AR),
    outstanding(ACCOUNT.AP),
    salesTrend(scopedWarehouse, trendStart),
    topProducts(scopedWarehouse),
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
