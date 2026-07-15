function serializeGatePass(gatePass) {
  const g = gatePass && gatePass.toJSON ? gatePass.toJSON() : { ...gatePass };
  const sourceId = g.sourceType === 'PURCHASE' ? g.purchase : g.sale;
  g.sourceId = sourceId ? String(sourceId._id ?? sourceId) : undefined;
  g.source = {
    type: g.sourceType,
    id: g.sourceId,
    number: g.documentNumber,
  };
  g.qr = {
    url: `/gate-passes/${g._id}/qr`,
    apiPath: `/api/gate-passes/${g._id}/qr`,
    contentType: 'image/png',
    filename: `${g.number}.png`,
    requiresAuthentication: true,
  };
  return g;
}

module.exports = { serializeGatePass };
