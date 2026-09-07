const saleService = require('../services/saleService');
const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/ApiResponse');
const { view } = require('../utils/money');

const out = (s) => (s && s.toJSON ? s.toJSON() : s);
function serialize(sale) {
  const raw = out(sale);
  // Paid so far = collected at checkout + anything settled later against this
  // sale specifically. Remaining = total owed after returns and payments.
  const paidAmount =
    (raw.cashAmount || 0) + (raw.onlineAmount || 0) + (raw.additionalPaidAmount || 0);
  const balanceDue = Math.max(0, (raw.total || 0) - (raw.returnedTotal || 0) - paidAmount);

  const s = view({ ...raw, paidAmount, balanceDue }, [
    'subtotal',
    'discount',
    'tax',
    'transportFare',
    'labourRent',
    'total',
    'cost',
    'cashAmount',
    'onlineAmount',
    'creditAmount',
    'additionalPaidAmount',
    'returnedTotal',
    'paidAmount',
    'balanceDue',
  ]);
  if (Array.isArray(s.items)) {
    s.items = s.items.map((it) =>
      view(it && it.toJSON ? it.toJSON() : it, ['unitPrice', 'lineTotal', 'cost']),
    );
  }
  if (Array.isArray(s.labour)) {
    s.labour = s.labour.map((l) => view(l, ['rent']));
  }
  if (s.gatePass) {
    s.gatePassId = String(s.gatePass._id ?? s.gatePass);
    s.gatePassUrl = `/gate-passes/${s.gatePassId}`;
    s.gatePassQrUrl = `/gate-passes/${s.gatePassId}/qr`;
  }
  if (Array.isArray(s.warehouseGatePasses)) {
    s.warehouseGatePasses = s.warehouseGatePasses.map((entry) => {
      const gatePassId = String(entry.gatePass?._id ?? entry.gatePass);
      return {
        warehouseId: String(entry.warehouse?._id ?? entry.warehouse),
        gatePassId,
        gatePassUrl: `/gate-passes/${gatePassId}`,
        gatePassQrUrl: `/gate-passes/${gatePassId}/qr`,
      };
    });
  }
  if (s.vendorGatePass) {
    s.vendorGatePassId = String(s.vendorGatePass._id ?? s.vendorGatePass);
    s.vendorGatePassUrl = `/gate-passes/${s.vendorGatePassId}`;
    s.vendorGatePassQrUrl = `/gate-passes/${s.vendorGatePassId}/qr`;
  }
  return s;
}

// Merges the point-in-time customer balance snapshot onto the serialized
// sale, for callers (invoice printing) that need "Previous Balance" / "Total
// Remaining" alongside the sale itself.
async function serializeWithBalances(sale) {
  const balances = await saleService.getSaleBalances(sale);
  return { ...serialize(sale), ...balances };
}

const createSale = asyncHandler(async (req, res) => {
  const sale = await saleService.createSale(req.user, req.body);
  return sendSuccess(res, 201, 'Sale recorded', { sale: await serializeWithBalances(sale) });
});

const updateSale = asyncHandler(async (req, res) => {
  const sale = await saleService.updateSale(req.user, req.params.id, req.body);
  return sendSuccess(res, 200, 'Sale updated', { sale: await serializeWithBalances(sale) });
});

const recordPayment = asyncHandler(async (req, res) => {
  const sale = await saleService.recordPayment(req.user, req.params.id, req.body);
  return sendSuccess(res, 200, 'Payment recorded', { sale: await serializeWithBalances(sale) });
});

const listSales = asyncHandler(async (req, res) => {
  const {
    page,
    limit,
    customer,
    vendor,
    labour,
    transporter,
    warehouse,
    store,
    from,
    to,
    paymentMethod,
  } = req.query;
  const result = await saleService.listSales({
    page,
    limit,
    customer,
    vendor,
    labour,
    transporter,
    warehouse,
    store,
    from,
    to,
    paymentMethod,
    actor: req.user,
  });
  return sendSuccess(res, 200, 'Sales fetched', {
    ...result,
    sales: result.sales.map(serialize),
  });
});

const getSale = asyncHandler(async (req, res) => {
  const sale = await saleService.getSaleById(req.user, req.params.id);
  return sendSuccess(res, 200, 'Sale fetched', { sale: await serializeWithBalances(sale) });
});

module.exports = { createSale, updateSale, recordPayment, listSales, getSale };
