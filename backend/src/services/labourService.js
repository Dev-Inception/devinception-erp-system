const { Op } = require('sequelize');
const { initializeModels } = require('../db/models');
const ApiError = require('../utils/ApiError');
const journalService = require('./journalService');
const { ACCOUNT } = require('../utils/finance');
const { toPaisa } = require('../utils/money');
const {
  requireWriteStore,
  resolveStoreScope,
  storeWhere,
  assertStoreAccess,
} = require('../utils/storeScope');

// Overlays each labourer's live payable balance (rent charged on sales that
// hasn't been paid out yet) — same pattern as vendorService.listVendors.
async function listLabour(query = {}) {
  const { Labour } = initializeModels();
  const { storeIds } = await resolveStoreScope({ store: query.store, actor: query.actor });
  const where = storeWhere(storeIds);
  const [docs, balances] = await Promise.all([
    Labour.findAll({ where, order: [['createdAt', 'DESC']] }),
    journalService.balancesByRef(ACCOUNT.AP_LABOUR, { store: storeIds }),
  ]);
  return docs.map((l) => {
    const json = l.toJSON();
    return { ...json, outstanding: balances.get(json._id) || 0 };
  });
}

async function getLabourById(actor, id) {
  const { Labour } = initializeModels();
  const labour = await Labour.findByPk(id);
  if (!labour) throw ApiError.notFound('Labour not found');
  assertStoreAccess(actor, labour.store);
  return labour;
}

async function createLabour(actor, { name, phoneNumber, store }) {
  const { Store, Labour } = initializeModels();
  const storeId = requireWriteStore(actor, store);
  const storeDoc = await Store.findByPk(storeId);
  if (!storeDoc) throw ApiError.badRequest('Store not found');

  // Check for duplicate phone number within this store
  const existing = await Labour.findOne({ where: { store: storeDoc.id, phoneNumber } });
  if (existing) throw ApiError.conflict('Labour with this phone number already exists');

  return Labour.create({ name, phoneNumber, store: storeDoc.id });
}

async function updateLabour(actor, id, { name, phoneNumber }) {
  const labour = await getLabourById(actor, id);

  // Check if phone number is being changed and already exists in this store
  if (phoneNumber && phoneNumber !== labour.phoneNumber) {
    const existing = await Labour.findOne({ where: { store: labour.store, phoneNumber } });
    if (existing) throw ApiError.conflict('Labour with this phone number already exists');
    labour.phoneNumber = phoneNumber;
  }

  if (name) labour.name = name;

  await labour.save();
  return labour;
}

async function deleteLabour(actor, id) {
  const labour = await getLabourById(actor, id);
  await labour.destroy();
  return labour;
}

/**
 * Resolves a raw `labour` input — either a plain array of labour ids, or
 * `{ labour, service, rent }` objects when each labourer has a per-job
 * charge attached — into snapshot line items
 * `{ labour, name, phoneNumber, service, serviceName, rent }` (rent in
 * paisa). Shared by any flow that charges labour on a document (POS sales,
 * stock receiving).
 *
 * Unlike a plain labour id (deduped by document), `service` entries are NOT
 * deduped — a POS sale attaches one line per (labour, service) pair, so the
 * same labourer can appear more than once, each line billing a different
 * service. Stock receiving doesn't pass `service` at all, so it keeps
 * getting exactly one line per labourer, same as before.
 */
async function resolveLabourLines(labourInput, storeId, transaction) {
  const { Labour, LabourService } = initializeModels();
  const input = Array.isArray(labourInput) ? labourInput : [];
  const entries = input
    .map((l) => (l && typeof l === 'object' ? l : { labour: l }))
    .filter((l) => l.labour);

  const labourIds = Array.from(new Set(entries.map((l) => String(l.labour))));
  const labourDocs = labourIds.length
    ? await Labour.findAll({ where: { id: { [Op.in]: labourIds } }, transaction })
    : [];
  if (
    labourDocs.length !== labourIds.length ||
    labourDocs.some((doc) => String(doc.store) !== String(storeId))
  ) {
    throw ApiError.badRequest('One or more labour entries are invalid');
  }
  const labourById = new Map(labourDocs.map((doc) => [String(doc.id), doc]));

  const serviceIds = Array.from(
    new Set(entries.map((l) => (l.service ? String(l.service) : null)).filter(Boolean)),
  );
  const serviceDocs = serviceIds.length
    ? await LabourService.findAll({ where: { id: { [Op.in]: serviceIds } }, transaction })
    : [];
  if (
    serviceDocs.length !== serviceIds.length ||
    serviceDocs.some((doc) => String(doc.store) !== String(storeId))
  ) {
    throw ApiError.badRequest('One or more labour services are invalid');
  }
  const serviceById = new Map(serviceDocs.map((doc) => [String(doc.id), doc]));

  return entries.map((l) => {
    const doc = labourById.get(String(l.labour));
    const serviceDoc = l.service ? serviceById.get(String(l.service)) : null;
    return {
      labour: doc.id,
      name: doc.name,
      phoneNumber: doc.phoneNumber,
      service: serviceDoc ? serviceDoc.id : null,
      serviceName: serviceDoc ? serviceDoc.name : '',
      rent: toPaisa(l.rent || 0),
    };
  });
}

/**
 * Posts the labour payable for a document's labour lines: Dr Operating
 * Expense (summed rent) / Cr AP_LABOUR per labourer with rent > 0. One
 * balanced entry covering every labourer on the document. `label` names the
 * source document in the entry's description (e.g. "sale", "stock receipt").
 * Must run inside the caller's transaction (see journalService.post).
 */
async function postLabourPayable(
  labourLines,
  { when, refType, refNo, store, actor, label, transaction },
) {
  const withRent = (labourLines || []).filter((l) => l.rent > 0);
  if (withRent.length === 0) return;
  const total = withRent.reduce((s, l) => s + l.rent, 0);
  await journalService.post({
    date: when,
    description: `Labour charges for ${label} ${refNo}`,
    refType,
    refNo,
    store,
    createdBy: actor ? actor.id : null,
    transaction,
    lines: [
      journalService.line(ACCOUNT.OPERATING_EXPENSE, { debit: total }),
      ...withRent.map((l) =>
        journalService.line(ACCOUNT.AP_LABOUR, { credit: l.rent, ref: l.labour }),
      ),
    ],
  });
}

// Mirror of postLabourPayable with debit/credit swapped — used to undo a
// document's original labour payable before an edit (or delete) posts a
// fresh one (or nothing). Must run inside the caller's transaction.
async function reverseLabourPayable(
  labourLines,
  { when, refType, refNo, store, actor, label, transaction },
) {
  const withRent = (labourLines || []).filter((l) => l.rent > 0);
  if (withRent.length === 0) return;
  const total = withRent.reduce((s, l) => s + l.rent, 0);
  await journalService.post({
    date: when,
    description: `Reversal of labour charges for edited ${label} ${refNo}`,
    refType,
    refNo,
    store,
    createdBy: actor ? actor.id : null,
    transaction,
    lines: [
      ...withRent.map((l) =>
        journalService.line(ACCOUNT.AP_LABOUR, { debit: l.rent, ref: l.labour }),
      ),
      journalService.line(ACCOUNT.OPERATING_EXPENSE, { credit: total }),
    ],
  });
}

module.exports = {
  listLabour,
  getLabourById,
  createLabour,
  updateLabour,
  deleteLabour,
  resolveLabourLines,
  postLabourPayable,
  reverseLabourPayable,
};
