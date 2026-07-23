const { toRupees } = require('../utils/money');

function idOf(value) {
  if (!value) return null;
  return String(value._id ?? value);
}

function withoutEmptyValues(value) {
  return Object.fromEntries(
    Object.entries(value).filter(
      ([, field]) => field !== null && field !== undefined && field !== '',
    ),
  );
}

function serializeGatePass(gatePass) {
  const g = gatePass && gatePass.toJSON ? gatePass.toJSON() : { ...gatePass };
  const gatePassId = idOf(g._id);
  const isPurchase = g.sourceType === 'PURCHASE';
  // customer/saleId/saleNumber field names predate the PURCHASE (goods-in)
  // gate pass type; kept as-is for existing SALE consumers and reused to
  // carry the vendor/purchase equivalent so both types share one shape.
  // `sourceType`/`direction`/`purchaseId` disambiguate for new consumers.
  const partyInfo = isPurchase ? g.vendorInfo : g.customerInfo;

  return {
    id: gatePassId,
    number: g.number,
    sourceType: g.sourceType,
    direction: isPurchase ? 'IN' : 'OUT',
    saleId: idOf(g.sale),
    purchaseId: idOf(g.purchase),
    saleNumber: g.documentNumber,
    saleDate: g.saleDate,
    customer: withoutEmptyValues({
      id: idOf(partyInfo?.customer ?? partyInfo?.vendor),
      name: partyInfo?.name,
      phone: partyInfo?.phone,
      email: partyInfo?.email,
      address: partyInfo?.address,
    }),
    items: (g.items || []).map((item) =>
      withoutEmptyValues({
        productId: idOf(item.product),
        name: item.name,
        sku: item.sku,
        barcode: item.barcode,
        quantity: item.quantity,
        unitPrice: toRupees(item.unitPrice),
        lineTotal: toRupees(item.lineTotal),
      }),
    ),
    pricing: {
      subtotal: toRupees(g.pricing?.subtotal),
      discount: toRupees(g.pricing?.discount),
      taxPercent: g.pricing?.taxPercent || 0,
      tax: toRupees(g.pricing?.tax),
      total: toRupees(g.pricing?.total),
    },
    ...(g.createdBy
      ? {
          createdBy: withoutEmptyValues({
            id: idOf(g.createdBy),
            name: g.createdBy?.name,
          }),
        }
      : {}),
    status: g.status,
    ...(g.scannedAt ? { scannedAt: g.scannedAt } : {}),
    qrUrl: `/api/gate-passes/${gatePassId}/qr`,
  };
}

module.exports = { serializeGatePass };
