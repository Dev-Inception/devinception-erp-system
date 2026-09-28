const stockReceiptService = require('../services/stockReceiptService');
const pendingEntityService = require('../services/pendingEntityService');
const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/ApiResponse');
const { view } = require('../utils/money');

const out = (r) => (r && r.toJSON ? r.toJSON() : r);

// Sequelize includes land under a `*Info` alias (e.g. `warehouseInfo`)
// alongside the untouched raw FK (`warehouse`). The frontend still expects
// the old Mongo-`populate()` shape, where the ref field itself becomes the
// populated object — so move each `*Info` value onto its ref field when
// present (a receipt whose query didn't include that association keeps the
// raw id, same as an un-populated Mongo ref).
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

function serialize(receipt) {
  const r = foldRefs(out(receipt), ['warehouse', 'store', 'transporter']);
  if (r.gatePass) {
    const gatePassId = String(r.gatePass._id ?? r.gatePass);
    r.gatePassId = gatePassId;
    r.gatePassUrl = `/gate-passes/${gatePassId}`;
    r.gatePassQrUrl = `/gate-passes/${gatePassId}/qr`;
  }
  return r;
}

/**
 * Overlays each receipt's supplier-payable info, sourced from PendingEntity
 * (see pendingEntityService): per-line purchase price/status, and the
 * receipt-level priced total / paid / balance due used by the "Print
 * Invoice" and "Record Payment" actions. Money fields are converted to
 * rupees at this boundary, same as elsewhere.
 */
async function withPricing(receipts) {
  const list = Array.isArray(receipts) ? receipts : [receipts];
  const ids = list.map((r) => r.id);
  const [totals, entitiesByReceipt] = await Promise.all([
    pendingEntityService.pricedTotalsByStockReceipt(ids),
    pendingEntityService.listByStockReceipts(ids),
  ]);

  const results = list.map((receipt) => {
    const r = serialize(receipt);
    const entities = entitiesByReceipt.get(String(receipt.id)) || [];
    const entityByProduct = new Map(entities.map((e) => [String(e.product), e]));

    r.items = (r.items || []).map((item) => {
      const entity = entityByProduct.get(String(item.product?._id ?? item.product));
      return {
        ...item,
        pricingStatus: entity ? entity.status : undefined,
        ...view(
          { purchasePrice: entity?.purchasePrice ?? null, lineTotal: entity?.lineTotal ?? null },
          ['purchasePrice', 'lineTotal'],
        ),
      };
    });

    if (Array.isArray(r.labour)) {
      r.labour = r.labour.map((l) => view(l, ['rent']));
    }

    const pricedTotal = totals.get(String(receipt.id)) || 0;
    const paidAmount = receipt.additionalPaidAmount || 0;
    const balanceDue = Math.max(0, pricedTotal - paidAmount);
    return {
      ...r,
      ...view(
        { pricedTotal, paidAmount, balanceDue, truckFare: r.truckFare, labourRent: r.labourRent },
        ['pricedTotal', 'paidAmount', 'balanceDue', 'truckFare', 'labourRent'],
      ),
    };
  });

  return Array.isArray(receipts) ? results : results[0];
}

const createReceipt = asyncHandler(async (req, res) => {
  const receipt = await stockReceiptService.createReceipt(req.user, req.body);
  return sendSuccess(res, 201, 'Stock receipt recorded', { receipt: await withPricing(receipt) });
});

const updateReceipt = asyncHandler(async (req, res) => {
  const receipt = await stockReceiptService.updateReceipt(req.user, req.params.id, req.body);
  return sendSuccess(res, 200, 'Stock receipt updated', { receipt: await withPricing(receipt) });
});

const deleteReceipt = asyncHandler(async (req, res) => {
  await stockReceiptService.deleteReceipt(req.user, req.params.id);
  return sendSuccess(res, 200, 'Stock receipt deleted', {});
});

const listReceipts = asyncHandler(async (req, res) => {
  const { page, limit, supplier, labour, transporter, warehouse, store, from, to, search } =
    req.query;
  const result = await stockReceiptService.listReceipts({
    page,
    limit,
    supplier,
    labour,
    transporter,
    warehouse,
    store,
    from,
    to,
    search,
    actor: req.user,
  });
  return sendSuccess(res, 200, 'Stock receipts fetched', {
    ...result,
    receipts: await withPricing(result.receipts),
  });
});

const recordPayment = asyncHandler(async (req, res) => {
  const receipt = await stockReceiptService.recordPayment(req.user, req.params.id, req.body);
  return sendSuccess(res, 200, 'Payment recorded', { receipt: await withPricing(receipt) });
});

module.exports = { createReceipt, updateReceipt, deleteReceipt, listReceipts, recordPayment };
