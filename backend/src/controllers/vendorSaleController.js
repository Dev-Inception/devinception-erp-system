const vendorSaleService = require('../services/vendorSaleService');
const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/ApiResponse');
const { view } = require('../utils/money');

const out = (r) => (r && r.toJSON ? r.toJSON() : r);

// See stockReceiptController's foldRefs — moves each Sequelize `*Info`
// association alias onto its ref field, matching the shape the frontend
// already expects from an un-populated-vs-populated Mongo ref.
function foldRefs(raw, refs) {
  for (const ref of refs) {
    const infoKey = `${ref}Info`;
    if (infoKey in raw) {
      raw[ref] = raw[infoKey];
      delete raw[infoKey];
    }
  }
  return raw;
}

function serialize(vendorSale) {
  const r = foldRefs(out(vendorSale), ['vendor', 'store', 'warehouse']);
  const moneyFields = [
    'subtotal',
    'discount',
    'tax',
    'total',
    'cost',
    'cashAmount',
    'onlineAmount',
    'creditAmount',
    'returnedTotal',
  ];
  const view0 = view(r, moneyFields);
  if (Array.isArray(view0.items)) {
    view0.items = view0.items.map((it) => view(it, ['unitPrice', 'lineTotal', 'cost']));
  }
  if (view0.gatePass) {
    const gatePassId = String(view0.gatePass._id ?? view0.gatePass);
    view0.gatePassId = gatePassId;
    view0.gatePassUrl = `/gate-passes/${gatePassId}`;
    view0.gatePassQrUrl = `/gate-passes/${gatePassId}/qr`;
  }
  return view0;
}

const createVendorSale = asyncHandler(async (req, res) => {
  const vendorSale = await vendorSaleService.createVendorSale(req.user, req.body);
  return sendSuccess(res, 201, 'Vendor sale recorded', { vendorSale: serialize(vendorSale) });
});

const getVendorSale = asyncHandler(async (req, res) => {
  const vendorSale = await vendorSaleService.getVendorSale(req.user, req.params.id);
  return sendSuccess(res, 200, 'Vendor sale fetched', { vendorSale: serialize(vendorSale) });
});

const updateVendorSale = asyncHandler(async (req, res) => {
  const vendorSale = await vendorSaleService.updateVendorSale(req.user, req.params.id, req.body);
  return sendSuccess(res, 200, 'Vendor sale updated', { vendorSale: serialize(vendorSale) });
});

const listVendorSales = asyncHandler(async (req, res) => {
  const { page, limit, vendor, store, warehouse, from, to, search } = req.query;
  const result = await vendorSaleService.listVendorSales({
    page,
    limit,
    vendor,
    store,
    warehouse,
    from,
    to,
    search,
    actor: req.user,
  });
  return sendSuccess(res, 200, 'Vendor sales fetched', {
    ...result,
    vendorSales: result.vendorSales.map(serialize),
  });
});

module.exports = { createVendorSale, getVendorSale, listVendorSales, updateVendorSale };
