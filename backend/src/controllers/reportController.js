const reportService = require('../services/reportService');
const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/ApiResponse');
const { view } = require('../utils/money');

// Money fields per report (everything else — counts, quantities, labels — is
// left untouched).
const ROW_MONEY = {
  sales: ['cash', 'online', 'credit', 'total'],
  purchases: ['total', 'paid', 'balance'],
  'stock-valuation': ['avgCost', 'value'],
};
const SUMMARY_MONEY = {
  sales: ['cash', 'online', 'credit', 'total'],
  purchases: ['total', 'paid', 'balance'],
  'stock-valuation': ['total'],
};

function serialize(type, data) {
  if (type === 'profit-loss') {
    return view(data, ['revenue', 'costOfGoodsSold', 'grossProfit', 'netProfit']);
  }
  return {
    rows: (data.rows || []).map((r) => view(r, ROW_MONEY[type] || [])),
    summary: view(data.summary || {}, SUMMARY_MONEY[type] || []),
  };
}

const getReport = asyncHandler(async (req, res) => {
  const { type } = req.params;
  const { from, to, warehouse } = req.query;
  const data = await reportService.runReport(type, { from, to, warehouse });
  return sendSuccess(res, 200, 'Report generated', { type, report: serialize(type, data) });
});

module.exports = { getReport };
