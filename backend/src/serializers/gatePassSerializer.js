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
  const processor = g.processedBy
    ? withoutEmptyValues({
        id: idOf(g.processedBy),
        name: g.processedBy?.name,
      })
    : null;

  return {
    id: gatePassId,
    number: g.number,
    sourceType: g.sourceType,
    kind: g.kind || 'CUSTOMER',
    direction: isPurchase ? 'IN' : 'OUT',
    saleId: idOf(g.sale),
    purchaseId: idOf(g.purchase),
    saleNumber: g.documentNumber,
    saleDate: g.saleDate,
    partyName: g.partyName || '',
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
    // Captured at POS time (Sale.transport / Sale.labour) for SALE-sourced
    // passes — the scan page shows these read-only instead of asking again.
    ...(g.saleTransport && Object.keys(withoutEmptyValues(g.saleTransport)).length
      ? { transport: withoutEmptyValues(g.saleTransport) }
      : {}),
    ...(Array.isArray(g.saleLabour) && g.saleLabour.length
      ? {
          labour: g.saleLabour.map((l) =>
            withoutEmptyValues({ name: l.name, phoneNumber: l.phoneNumber }),
          ),
        }
      : {}),
    ...(g.createdBy
      ? {
          createdBy: withoutEmptyValues({
            id: idOf(g.createdBy),
            name: g.createdBy?.name,
          }),
        }
      : {}),
    ...(processor ? { processedBy: processor, scannedBy: processor } : {}),
    status,
    ...(g.processedAt ? { processedAt: g.processedAt } : {}),
    ...(g.lastEditedAt ? { lastEditedAt: g.lastEditedAt } : {}),
    qrUrl: `/api/gate-passes/${gatePassId}/qr`,
  };
}

module.exports = { serializeGatePass };
