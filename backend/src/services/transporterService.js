const Transporter = require('../models/transporterModel');
const Store = require('../models/storeModel');
const ApiError = require('../utils/ApiError');
const journalService = require('./journalService');
const { ACCOUNT, REF } = require('../utils/finance');
const { toPaisa, toRupees } = require('../utils/money');
const { parsePagination, escapeRegex } = require('../utils/query');
const { assertStoreAccess } = require('../utils/storeScope');
const counterService = require('./counterService');

// Every transport charge happens at one physical storefront's till — same
// requirement paymentService.js enforces for its own money movements.
async function requireStore(actor, store) {
  const storeDoc = await Store.findById(store);
  if (!storeDoc) throw ApiError.badRequest('A store is required');
  assertStoreAccess(actor, storeDoc._id);
  return storeDoc;
}

/**
 * Transporter roster + booking a fare charge against one. Authorization is
 * enforced by route middleware; here we enforce the data rules. `outstanding`
 * is intentionally never accepted from the client — it is maintained by
 * charge/payment flows. Mirrors vendorService.js.
 */

function pickWritable({ name, phone, vehicleNumber, address }) {
  const fields = { name, phone, vehicleNumber, address };
  Object.keys(fields).forEach((k) => fields[k] === undefined && delete fields[k]);
  return fields;
}

async function listTransporters(query = {}) {
  const { page, limit, skip } = parsePagination(query, { defaultLimit: 1000, maxLimit: 100000 });
  const filter = {};
  if (query.search) {
    const term = escapeRegex(query.search);
    filter.$or = [
      { name: { $regex: term, $options: 'i' } },
      { phone: { $regex: term, $options: 'i' } },
      { vehicleNumber: { $regex: term, $options: 'i' } },
    ];
  }

  const [docs, total, balances] = await Promise.all([
    Transporter.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    Transporter.countDocuments(filter),
    journalService.balancesByRef(ACCOUNT.AP_TRANSPORT, { store: query.store }),
  ]);

  const transporters = docs.map((tr) => ({
    ...tr,
    outstanding: toRupees(balances.get(String(tr._id)) || 0),
  }));

  return { transporters, total, page, limit };
}

async function getTransporterById(id) {
  const transporter = await Transporter.findById(id);
  if (!transporter) throw ApiError.notFound('Transporter not found');
  return transporter;
}

async function createTransporter(data) {
  return Transporter.create(pickWritable(data));
}

async function updateTransporter(id, data) {
  const transporter = await getTransporterById(id);
  Object.assign(transporter, pickWritable(data));
  await transporter.save();
  return transporter;
}

async function deleteTransporter(id) {
  const transporter = await getTransporterById(id);
  if (transporter.outstanding > 0) {
    throw ApiError.badRequest('Transporter has an outstanding balance and cannot be deleted');
  }
  await transporter.deleteOne();
}

// Books a fare owed to a transporter — Dr OPERATING_EXPENSE / Cr
// AP_TRANSPORT(ref=transporter). Pure liability creation, no cash movement;
// see paymentService.payTransport for settling it back down. Analogous in
// shape to pendingEntityService.setPurchasePrice booking a vendor payable.
async function chargeTransport(actor, { transporter, store, amount, date, note }) {
  const transporterDoc = await getTransporterById(transporter);
  const storeDoc = await requireStore(actor, store);

  const amt = toPaisa(amount);
  if (amt <= 0) throw ApiError.badRequest('Amount must be positive');
  const when = date ? new Date(date) : new Date();
  const number = await counterService.nextDocNumber('EXP', when.getFullYear(), 6);

  return journalService.post({
    date: when,
    description: note || `Transport charge — ${transporterDoc.name}`,
    refType: REF.EXPENSE,
    refNo: number,
    store: storeDoc._id,
    createdBy: actor ? actor._id : null,
    lines: [
      journalService.line(ACCOUNT.OPERATING_EXPENSE, { debit: amt }),
      journalService.line(ACCOUNT.AP_TRANSPORT, { credit: amt, ref: transporterDoc._id }),
    ],
  });
}

module.exports = {
  listTransporters,
  getTransporterById,
  createTransporter,
  updateTransporter,
  deleteTransporter,
  chargeTransport,
};
