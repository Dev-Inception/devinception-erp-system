const pendingEntityService = require('../services/pendingEntityService');
const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/ApiResponse');
const { view } = require('../utils/money');

// Sequelize includes land under a `*Info` alias (e.g. `storeInfo`)
// alongside the untouched raw FK (`store`). The frontend still expects the
// old Mongo-`populate()` shape, where the ref field itself becomes the
// populated object — so move each `*Info` value onto its ref field when
// present (an entity whose query didn't include that association keeps the
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

const out = (e) =>
  e
    ? view(
        foldRefs(e.toJSON ? e.toJSON() : e, [
          'vendor',
          'supplier',
          'product',
          'store',
          'warehouse',
        ]),
        ['purchasePrice', 'lineTotal'],
      )
    : e;

const listPendingEntities = asyncHandler(async (req, res) => {
  const { status, vendor, supplier, store, sourceType, search, page, limit } = req.query;
  const result = await pendingEntityService.listPendingEntities({
    status,
    vendor,
    supplier,
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
