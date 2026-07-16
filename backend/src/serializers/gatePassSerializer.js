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

  return {
    id: gatePassId,
    number: g.number,
    saleId: idOf(g.sale),
    saleNumber: g.documentNumber,
    saleDate: g.saleDate,
    customer: withoutEmptyValues({
      id: idOf(g.customerInfo?.customer),
      name: g.customerInfo?.name,
      phone: g.customerInfo?.phone,
      email: g.customerInfo?.email,
      address: g.customerInfo?.address,
    }),
    items: (g.items || []).map((item) =>
      withoutEmptyValues({
        productId: idOf(item.product),
        name: item.name,
        sku: item.sku,
        barcode: item.barcode,
        quantity: item.quantity,
      }),
    ),
    status: g.status,
    ...(g.scannedAt ? { scannedAt: g.scannedAt } : {}),
    qrUrl: `/api/gate-passes/${gatePassId}/qr`,
  };
}

module.exports = { serializeGatePass };
