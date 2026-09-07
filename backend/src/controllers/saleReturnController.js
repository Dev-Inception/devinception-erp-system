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
  if (Array.isArray(r.warehouseGatePasses)) {
    r.warehouseGatePasses = r.warehouseGatePasses.map((entry) => {
      const gatePassId = String(entry.gatePass?._id ?? entry.gatePass);
      return {
        warehouseId: String(entry.warehouse?._id ?? entry.warehouse),
        gatePassId,
        gatePassUrl: `/gate-passes/${gatePassId}`,
        gatePassQrUrl: `/gate-passes/${gatePassId}/qr`,
      };
    });
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

const listAllReturns = asyncHandler(async (req, res) => {
  const { page, limit, customer, from, to, search } = req.query;
  const result = await saleReturnService.listReturns({ page, limit, customer, from, to, search });
  return sendSuccess(res, 200, 'Returns fetched', {
    ...result,
    returns: result.returns.map(serialize),
  });
});

module.exports = { createReturn, listReturns, listAllReturns };
