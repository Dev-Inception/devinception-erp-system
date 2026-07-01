const saleService = require('../services/saleService');
const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/ApiResponse');
const { view } = require('../utils/money');

const out = (s) => (s && s.toJSON ? s.toJSON() : s);
function serialize(sale) {
  const s = view(out(sale), [
    'subtotal',
    'discount',
    'tax',
    'total',
    'cost',
    'cashAmount',
    'onlineAmount',
    'creditAmount',
  ]);
  if (Array.isArray(s.items)) {
    s.items = s.items.map((it) => view(it, ['unitPrice', 'lineTotal', 'cost']));
  }
  return s;
}

const createSale = asyncHandler(async (req, res) => {
  const sale = await saleService.createSale(req.user, req.body);
  return sendSuccess(res, 201, 'Sale recorded', { sale: serialize(sale) });
});

const listSales = asyncHandler(async (req, res) => {
  const { page, limit, customer, from, to } = req.query;
  const result = await saleService.listSales({ page, limit, customer, from, to });
  return sendSuccess(res, 200, 'Sales fetched', {
    ...result,
    sales: result.sales.map(serialize),
  });
});

const getSale = asyncHandler(async (req, res) => {
  const sale = await saleService.getSaleById(req.params.id);
  return sendSuccess(res, 200, 'Sale fetched', { sale: serialize(sale) });
});

module.exports = { createSale, listSales, getSale };
