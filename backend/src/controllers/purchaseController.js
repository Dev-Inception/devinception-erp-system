const purchaseService = require('../services/goodsPurchaseService');
const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/ApiResponse');
const { view } = require('../utils/money');

const out = (p) => (p && p.toJSON ? p.toJSON() : p);
function serialize(purchase) {
  const p = view(out(purchase), ['subtotal', 'discount', 'tax', 'total', 'paid', 'balance']);
  if (Array.isArray(p.items)) {
    p.items = p.items.map((it) => view(it, ['unitCost', 'tax', 'lineTotal']));
  }
  if (p.gatePass) {
    p.gatePassId = String(p.gatePass._id ?? p.gatePass);
    p.gatePassUrl = `/gate-passes/${p.gatePassId}`;
    p.gatePassQrUrl = `/gate-passes/${p.gatePassId}/qr`;
  }
  return p;
}

const createPurchase = asyncHandler(async (req, res) => {
  const purchase = await purchaseService.createPurchase(req.user, req.body);
  return sendSuccess(res, 201, 'Purchase recorded', { purchase: serialize(purchase) });
});

const listPurchases = asyncHandler(async (req, res) => {
  const { page, limit, vendor, from, to } = req.query;
  const result = await purchaseService.listPurchases({ page, limit, vendor, from, to });
  return sendSuccess(res, 200, 'Purchases fetched', {
    ...result,
    purchases: result.purchases.map(serialize),
  });
});

const getPurchase = asyncHandler(async (req, res) => {
  const purchase = await purchaseService.getPurchaseById(req.params.id);
  return sendSuccess(res, 200, 'Purchase fetched', { purchase: serialize(purchase) });
});

module.exports = { createPurchase, listPurchases, getPurchase };
