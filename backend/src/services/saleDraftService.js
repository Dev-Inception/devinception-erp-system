const { initializeModels } = require('../db/models');
const ApiError = require('../utils/ApiError');
const { SaleDraft } = initializeModels();
const actorId = (actor) => actor.id || actor._id;
function pickFields(body) {
  const allowed = [
    'store',
    'step',
    'customer',
    'items',
    'labour',
    'driver',
    'transportFare',
    'discountValue',
    'discountType',
    'taxPct',
    'advanceAmount',
  ];
  return Object.fromEntries(
    allowed.filter((key) => body[key] !== undefined).map((key) => [key, body[key]]),
  );
}
async function listDrafts(actor, store) {
  const where = { createdBy: actorId(actor) };
  if (store) where.store = store;
  return SaleDraft.findAll({ where, order: [['updatedAt', 'DESC']] });
}
async function getOwnedDraft(actor, id) {
  const row = await SaleDraft.findOne({ where: { id, createdBy: actorId(actor) } });
  if (!row) throw ApiError.notFound('Draft not found');
  return row;
}
const createDraft = (actor, body) =>
  SaleDraft.create({ createdBy: actorId(actor), ...pickFields(body) });
async function updateDraft(actor, id, body) {
  return (await getOwnedDraft(actor, id)).update(pickFields(body));
}
async function deleteDraft(actor, id) {
  await (await getOwnedDraft(actor, id)).destroy();
}
module.exports = { listDrafts, getOwnedDraft, createDraft, updateDraft, deleteDraft };
