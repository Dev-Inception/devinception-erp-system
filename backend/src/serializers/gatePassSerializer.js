function serializeGatePass(gatePass) {
  const g = gatePass && gatePass.toJSON ? gatePass.toJSON() : { ...gatePass };
  const sourceId = g.sale;
  g.sourceId = sourceId ? String(sourceId._id ?? sourceId) : undefined;
  g.source = {
    type: 'SALE',
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
