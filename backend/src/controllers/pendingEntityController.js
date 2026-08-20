const pendingEntityService = require('../services/pendingEntityService');
const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/ApiResponse');
const { view } = require('../utils/money');

const out = (e) => (e ? view(e.toJSON ? e.toJSON() : e, ['purchasePrice', 'lineTotal']) : e);

const listPendingEntities = asyncHandler(async (req, res) => {
  const { status, vendor, store, sourceType, search, page, limit } = req.query;
  const result = await pendingEntityService.listPendingEntities({
    status,
    vendor,
    store,
    sourceType,
    search,
    page,
    limit,
  });
  return sendSuccess(res, 200, 'Pending entities fetched', {
    entities: result.entities.map(out),
    total: result.total,
    page: result.page,
    limit: result.limit,
  });
});

const getPendingEntity = asyncHandler(async (req, res) => {
  const entity = await pendingEntityService.getPendingEntityById(req.params.id);
  return sendSuccess(res, 200, 'Pending entity fetched', { entity: out(entity) });
});

const setPrice = asyncHandler(async (req, res) => {
  const entity = await pendingEntityService.setPurchasePrice(
    req.user,
    req.params.id,
    req.body.purchasePrice,
  );
  return sendSuccess(res, 200, 'Purchase price recorded', { entity: out(entity) });
});

module.exports = { listPendingEntities, getPendingEntity, setPrice };
