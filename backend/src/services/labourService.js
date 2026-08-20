const Labour = require('../models/labourModel');
const ApiError = require('../utils/ApiError');
const journalService = require('./journalService');
const { ACCOUNT } = require('../utils/finance');
const { toPaisa } = require('../utils/money');

// Overlays each labourer's live payable balance (rent charged on sales that
// hasn't been paid out yet) — same pattern as vendorService.listVendors.
async function listLabour() {
  const [docs, balances] = await Promise.all([
    Labour.find().sort({ createdAt: -1 }).lean(),
    journalService.balancesByRef(ACCOUNT.AP_LABOUR),
  ]);
  return docs.map((l) => ({ ...l, outstanding: balances.get(String(l._id)) || 0 }));
}

async function getLabourById(id) {
  const labour = await Labour.findById(id);
  if (!labour) throw ApiError.notFound('Labour not found');
  return labour;
}

async function createLabour({ name, phoneNumber }) {
  // Check for duplicate phone number
  const existing = await Labour.findOne({ phoneNumber });
  if (existing) throw ApiError.conflict('Labour with this phone number already exists');

  const labour = await Labour.create({ name, phoneNumber });
  return labour;
}

async function updateLabour(id, { name, phoneNumber }) {
  const labour = await getLabourById(id);

  // Check if phone number is being changed and already exists
  if (phoneNumber && phoneNumber !== labour.phoneNumber) {
    const existing = await Labour.findOne({ phoneNumber });
    if (existing) throw ApiError.conflict('Labour with this phone number already exists');
    labour.phoneNumber = phoneNumber;
  }

  if (name) labour.name = name;

  await labour.save();
  return labour;
}

async function deleteLabour(id) {
  const labour = await getLabourById(id);
  await labour.deleteOne();
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
  const input = Array.isArray(labourInput) ? labourInput : [];
  const ids = Array.from(
    new Set(
      input
        .map((l) => (l && typeof l === 'object' ? l.labour : l))
        .filter(Boolean)
        .map(String),
    ),
  );
  const docs = ids.length ? await Labour.find({ _id: { $in: ids } }) : [];
  if (docs.length !== ids.length) {
    throw ApiError.badRequest('One or more labour entries are invalid');
  }
  const rentById = new Map(
    input
      .filter((l) => l && typeof l === 'object' && l.labour)
      .map((l) => [String(l.labour), toPaisa(l.rent || 0)]),
  );
  return docs.map((doc) => ({
    labour: doc._id,
    name: doc.name,
    phoneNumber: doc.phoneNumber,
    rent: rentById.get(String(doc._id)) || 0,
  }));
}

/**
 * Posts the labour payable for a document's labour lines: Dr Operating
 * Expense (summed rent) / Cr AP_LABOUR per labourer with rent > 0. One
 * balanced entry covering every labourer on the document. `label` names the
 * source document in the entry's description (e.g. "sale", "stock receipt").
 */
async function postLabourPayable(labourLines, { when, refType, refNo, store, actor, label }) {
  const withRent = (labourLines || []).filter((l) => l.rent > 0);
  if (withRent.length === 0) return;
  const total = withRent.reduce((s, l) => s + l.rent, 0);
  await journalService.post({
    date: when,
    description: `Labour charges for ${label} ${refNo}`,
    refType,
    refNo,
    store,
    createdBy: actor ? actor._id : null,
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
// fresh one (or nothing).
async function reverseLabourPayable(labourLines, { when, refType, refNo, store, actor, label }) {
  const withRent = (labourLines || []).filter((l) => l.rent > 0);
  if (withRent.length === 0) return;
  const total = withRent.reduce((s, l) => s + l.rent, 0);
  await journalService.post({
    date: when,
    description: `Reversal of labour charges for edited ${label} ${refNo}`,
    refType,
    refNo,
    store,
    createdBy: actor ? actor._id : null,
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
