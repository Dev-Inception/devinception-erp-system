const vendorSaleReturnService = require('../services/vendorSaleReturnService');
const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/ApiResponse');
const { view } = require('../utils/money');

const out = (r) => (r && r.toJSON ? r.toJSON() : r);
function serialize(vendorSaleReturn) {
  const r = view(out(vendorSaleReturn), ['subtotal', 'discount', 'tax', 'total', 'cost']);
  if (Array.isArray(r.items)) {
    r.items = r.items.map((it) => view(it, ['unitPrice', 'lineTotal', 'cost']));
  }
  return r;
}

const createReturn = asyncHandler(async (req, res) => {
  const vendorSaleReturn = await vendorSaleReturnService.createReturn(
    req.user,
    req.params.vendorSaleId,
    req.body,
  );
  return sendSuccess(res, 201, 'Return recorded', {
    vendorSaleReturn: serialize(vendorSaleReturn),
  });
});

const listReturns = asyncHandler(async (req, res) => {
  const returns = await vendorSaleReturnService.listReturnsForVendorSale(
    req.user,
    req.params.vendorSaleId,
  );
  return sendSuccess(res, 200, 'Returns fetched', { returns: returns.map(serialize) });
});

module.exports = { createReturn, listReturns };
