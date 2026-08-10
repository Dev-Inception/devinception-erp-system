const reportService = require('../services/reportService');
const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/ApiResponse');
const { view } = require('../utils/money');
const { generateReportCsv } = require('../services/reportCsvService');

// Money fields per report (everything else — counts, quantities, labels — is
// left untouched).
const ROW_MONEY = {
  sales: [
    'subtotal',
    'discount',
    'taxableAmount',
    'tax',
    'cash',
    'online',
    'credit',
    'paid',
    'balance',
    'total',
  ],
  'stock-valuation': ['avgCost', 'value'],
  'profit-loss': ['amount'],
  'day-book': ['amount'],
};
const SUMMARY_MONEY = {
  sales: [
    'subtotal',
    'discount',
    'taxableAmount',
    'tax',
    'cash',
    'online',
    'credit',
    'paid',
    'balance',
    'total',
  ],
  'stock-valuation': ['total'],
  'profit-loss': ['revenue', 'cogs', 'grossProfit', 'expenses', 'netProfit'],
  'day-book': [
    'totalSales',
    'totalCOGS',
    'totalPurchases',
    'totalExpenses',
    'totalVendorPayments',
    'totalCustomerReceipts',
    'cashIn',
    'cashOut',
    'netCash',
    'bankIn',
    'bankOut',
    'netBank',
  ],
};

function serialize(type, data) {
  if (type === 'profit-loss') {
    return {
      ...view(data, [
        'revenue',
        'costOfGoodsSold',
        'grossProfit',
        'operatingExpenses',
        'netProfit',
      ]),
      rows: (data.rows || []).map((r) => view(r, ROW_MONEY[type])),
      summary: view(data.summary || {}, SUMMARY_MONEY[type]),
    };
  }
  return {
    ...data,
    rows: (data.rows || []).map((r) => view(r, ROW_MONEY[type] || [])),
    summary: view(data.summary || {}, SUMMARY_MONEY[type] || []),
  };
}

const getReport = asyncHandler(async (req, res) => {
  const { type } = req.params;
  const { from, to, warehouse, store } = req.query;
  const data = await reportService.runReport(type, { from, to, warehouse, store });
  const query = new URLSearchParams();
  if (from) query.set('from', from);
  if (to) query.set('to', to);
  if (warehouse) query.set('warehouse', warehouse);
  if (store) query.set('store', store);
  const serializedQuery = query.toString();
  const suffix = serializedQuery ? `?${serializedQuery}` : '';
  const exportApiPath = `${req.baseUrl}/${encodeURIComponent(type)}/csv${suffix}`;
  const exportUrl = exportApiPath.replace(/^\/api(?=\/)/, '');
  const filename = `${type}-report-${new Date().toISOString().slice(0, 10)}.csv`;
  return sendSuccess(res, 200, 'Report generated', {
    type,
    report: serialize(type, data),
    export: {
      format: 'csv',
      url: exportUrl,
      apiPath: exportApiPath,
      filename,
      contentType: 'text/csv',
      requiresAuthentication: true,
    },
  });
});

const downloadReportCsv = asyncHandler(async (req, res) => {
  const { type } = req.params;
  const { from, to, warehouse, store } = req.query;
  const data = await reportService.runReport(type, { from, to, warehouse, store });
  const csv = generateReportCsv(type, data);
  const date = new Date().toISOString().slice(0, 10);

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${type}-report-${date}.csv"`);
  res.setHeader('Cache-Control', 'private, no-store');
  return res.status(200).send(csv);
});

module.exports = { getReport, downloadReportCsv };
