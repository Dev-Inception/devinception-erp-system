const saleReturnService = require('../services/saleReturnService');
const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/ApiResponse');
const { view } = require('../utils/money');

const out = (r) => (r && r.toJSON ? r.toJSON() : r);
function serialize(saleReturn) {
  const r = view(out(saleReturn), ['subtotal', 'discount', 'tax', 'total', 'cost']);
  if (Array.isArray(r.items)) {
    r.items = r.items.map((it) => view(it, ['unitPrice', 'lineTotal', 'cost']));
  }
  return r;
}

const createReturn = asyncHandler(async (req, res) => {
  const saleReturn = await saleReturnService.createReturn(req.user, req.params.saleId, req.body);
  return sendSuccess(res, 201, 'Return recorded', { saleReturn: serialize(saleReturn) });
});

const listReturns = asyncHandler(async (req, res) => {
  const returns = await saleReturnService.listReturnsForSale(req.params.saleId);
  return sendSuccess(res, 200, 'Returns fetched', { returns: returns.map(serialize) });
});

module.exports = { createReturn, listReturns };
