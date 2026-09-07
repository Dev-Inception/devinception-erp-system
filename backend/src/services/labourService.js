const { Op } = require('sequelize');
const { initializeModels } = require('../db/models');
const ApiError = require('../utils/ApiError');
const journalService = require('./journalService');
const { ACCOUNT } = require('../utils/finance');
const { toPaisa } = require('../utils/money');

// Overlays each labourer's live payable balance (rent charged on sales that
// hasn't been paid out yet) — same pattern as vendorService.listVendors.
async function listLabour() {
  const { Labour } = initializeModels();
  const [docs, balances] = await Promise.all([
    Labour.findAll({ order: [['createdAt', 'DESC']] }),
    journalService.balancesByRef(ACCOUNT.AP_LABOUR),
  ]);
  return docs.map((l) => {
    const json = l.toJSON();
    return { ...json, outstanding: balances.get(json._id) || 0 };
  });
}

async function getLabourById(id) {
  const { Labour } = initializeModels();
  const labour = await Labour.findByPk(id);
  if (!labour) throw ApiError.notFound('Labour not found');
  return labour;
}

async function createLabour({ name, phoneNumber }) {
  const { Labour } = initializeModels();
  // Check for duplicate phone number
  const existing = await Labour.findOne({ where: { phoneNumber } });
  if (existing) throw ApiError.conflict('Labour with this phone number already exists');

  return Labour.create({ name, phoneNumber });
}

async function updateLabour(id, { name, phoneNumber }) {
  const { Labour } = initializeModels();
  const labour = await getLabourById(id);

  // Check if phone number is being changed and already exists
  if (phoneNumber && phoneNumber !== labour.phoneNumber) {
    const existing = await Labour.findOne({ where: { phoneNumber } });
    if (existing) throw ApiError.conflict('Labour with this phone number already exists');
    labour.phoneNumber = phoneNumber;
  }

  if (name) labour.name = name;

  await labour.save();
  return labour;
}

async function deleteLabour(id) {
  const labour = await getLabourById(id);
  await labour.destroy();
  return labour;
}

/**
 * Resolves a raw `labour` input — either a plain array of labour ids, or
 * `{ labour, rent }` objects when each labourer has a per-job charge
 * attached — into snapshot line items `{ labour, name, phoneNumber, rent }`
 * (rent in paisa). Shared by any flow that charges labour on a document
 * (POS sales, stock receiving).
 */
async function resolveLabourLines(labourInput) {
  const { Labour } = initializeModels();
  const input = Array.isArray(labourInput) ? labourInput : [];
  const ids = Array.from(
    new Set(
      input
        .map((l) => (l && typeof l === 'object' ? l.labour : l))
        .filter(Boolean)
        .map(String),
    ),
  );
  const docs = ids.length ? await Labour.findAll({ where: { id: { [Op.in]: ids } } }) : [];
  if (docs.length !== ids.length) {
    throw ApiError.badRequest('One or more labour entries are invalid');
  }
  const rentById = new Map(
    input
      .filter((l) => l && typeof l === 'object' && l.labour)
      .map((l) => [String(l.labour), toPaisa(l.rent || 0)]),
  );
  return docs.map((doc) => ({
    labour: doc.id,
    name: doc.name,
    phoneNumber: doc.phoneNumber,
    rent: rentById.get(String(doc.id)) || 0,
  }));
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
