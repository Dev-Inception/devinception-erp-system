const damagedStockService = require('../services/damagedStockService');
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

function serialize(damagedReturn) {
  const r = foldRefs(out(damagedReturn), ['warehouse', 'store', 'supplier']);
  if (Array.isArray(r.items)) {
    r.items = r.items.map((it) => view(it, ['unitCost', 'lineTotal']));
  }
  if (r.gatePass) {
    const gatePassId = String(r.gatePass._id ?? r.gatePass);
    r.gatePassId = gatePassId;
    r.gatePassUrl = `/gate-passes/${gatePassId}`;
    r.gatePassQrUrl = `/gate-passes/${gatePassId}/qr`;
  }
  return r;
}

const listOutstanding = asyncHandler(async (req, res) => {
  const { page, limit, supplier, store, warehouse, search } = req.query;
  const result = await damagedStockService.listOutstanding({
    page,
    limit,
    supplier,
    store,
    warehouse,
    search,
    actor: req.user,
  });
  return sendSuccess(res, 200, 'Damaged stock fetched', result);
});

const createReturn = asyncHandler(async (req, res) => {
  const damagedReturn = await damagedStockService.createReturn(req.user, req.body);
  return sendSuccess(res, 201, 'Damaged stock return recorded', {
    damagedStockReturn: serialize(damagedReturn),
  });
});

const getReturn = asyncHandler(async (req, res) => {
  const damagedReturn = await damagedStockService.getReturn(req.user, req.params.id);
  return sendSuccess(res, 200, 'Damaged stock return fetched', {
    damagedStockReturn: serialize(damagedReturn),
  });
});

const listReturns = asyncHandler(async (req, res) => {
  const { page, limit, supplier, store, warehouse, from, to, search } = req.query;
  const result = await damagedStockService.listReturns({
    page,
    limit,
    supplier,
    store,
    warehouse,
    from,
    to,
    search,
    actor: req.user,
  });
  return sendSuccess(res, 200, 'Damaged stock returns fetched', {
    ...result,
    returns: result.returns.map(serialize),
  });
});

module.exports = { listOutstanding, createReturn, getReturn, listReturns };
