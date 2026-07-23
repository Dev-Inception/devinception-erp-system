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
  const status = g.status === 'ACTIVE' ? 'PENDING' : g.status === 'USED' ? 'PROCESSED' : g.status;

  return {
    id: gatePassId,
    number: g.number,
    sourceType: g.sourceType,
    direction: isPurchase ? 'IN' : 'OUT',
    saleId: idOf(g.sale),
    purchaseId: idOf(g.purchase),
    saleNumber: g.documentNumber,
    saleDate: g.saleDate,
    items: (g.items || []).map((item) =>
      withoutEmptyValues({
        productId: idOf(item.product),
        name: item.name,
        sku: item.sku,
        barcode: item.barcode,
        quantity: item.quantity,
        loadedQuantity: item.loadedQuantity,
        loadConfirmed: item.loadConfirmed,
      }),
    ),
    ...(g.driver ? { driver: withoutEmptyValues(g.driver) } : {}),
    ...(g.loadNotes ? { loadNotes: g.loadNotes } : {}),
    ...(g.createdBy
      ? {
          createdBy: withoutEmptyValues({
            id: idOf(g.createdBy),
            name: g.createdBy?.name,
          }),
        }
      : {}),
    ...(g.processedBy
      ? {
          processedBy: withoutEmptyValues({
            id: idOf(g.processedBy),
            name: g.processedBy?.name,
          }),
        }
      : {}),
    status,
    ...(g.processedAt ? { processedAt: g.processedAt } : {}),
    ...(g.lastEditedAt ? { lastEditedAt: g.lastEditedAt } : {}),
    qrUrl: `/api/gate-passes/${gatePassId}/qr`,
  };
}

module.exports = { serializeGatePass };
