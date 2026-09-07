const { Op } = require('sequelize');
const { getPostgres } = require('../db/postgres');
const { initializeModels } = require('../db/models');
const ApiError = require('../utils/ApiError');
const journalService = require('./journalService');
const { ACCOUNT, REF } = require('../utils/finance');
const { toPaisa, toRupees } = require('../utils/money');
const { parsePagination } = require('../utils/query');
const { assertStoreAccess } = require('../utils/storeScope');
const counterService = require('./counterService');

// Every transport charge happens at one physical storefront's till — same
// requirement paymentService.js enforces for its own money movements.
async function requireStore(actor, store, transaction) {
  const { Store } = initializeModels();
  const storeDoc = await Store.findByPk(store, { transaction });
  if (!storeDoc) throw ApiError.badRequest('A store is required');
  assertStoreAccess(actor, storeDoc.id);
  return storeDoc;
}

/**
 * Transporter roster + booking a fare charge against one. Authorization is
 * enforced by route middleware; here we enforce the data rules. `outstanding`
 * is intentionally never accepted from the client, and the stored column
 * (kept only for schema parity with the old Mongo model) is never trusted for
 * a balance check either — the live payable is always read from the ledger.
 * Mirrors vendorService.js.
 */

// Escapes ILIKE wildcards so a search term is matched literally.
function escapeLike(str) {
  return String(str).replace(/[\\%_]/g, '\\$&');
}

function pickWritable({ name, phone, vehicleNumber, address }) {
  const fields = { name, phone, vehicleNumber, address };
  Object.keys(fields).forEach((k) => fields[k] === undefined && delete fields[k]);
  return fields;
}

async function listTransporters(query = {}) {
  const { Transporter } = initializeModels();
  const { page, limit, skip } = parsePagination(query, { defaultLimit: 1000, maxLimit: 100000 });
  const where = {};
  if (query.search) {
    const term = `%${escapeLike(query.search)}%`;
    where[Op.or] = [
      { name: { [Op.iLike]: term } },
      { phone: { [Op.iLike]: term } },
      { vehicleNumber: { [Op.iLike]: term } },
    ];
  }

  const [docs, total, balances] = await Promise.all([
    Transporter.findAll({ where, order: [['createdAt', 'DESC']], offset: skip, limit }),
    Transporter.count({ where }),
    journalService.balancesByRef(ACCOUNT.AP_TRANSPORT, { store: query.store }),
  ]);

  const transporters = docs.map((tr) => {
    const json = tr.toJSON();
    return { ...json, outstanding: toRupees(balances.get(json._id) || 0) };
  });

  return { transporters, total, page, limit };
}

async function getTransporterById(id) {
  const { Transporter } = initializeModels();
  const transporter = await Transporter.findByPk(id);
  if (!transporter) throw ApiError.notFound('Transporter not found');
  return transporter;
}

async function createTransporter(data) {
  const { Transporter } = initializeModels();
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
  const balance = await journalService.accountBalance(ACCOUNT.AP_TRANSPORT, transporter.id);
  if (balance > 0) {
    throw ApiError.badRequest('Transporter has an outstanding balance and cannot be deleted');
  }
  await transporter.destroy();
}

// Books a fare owed to a transporter — Dr OPERATING_EXPENSE / Cr
// AP_TRANSPORT(ref=transporter). Pure liability creation, no cash movement;
// see paymentService.payTransport for settling it back down. Analogous in
// shape to pendingEntityService.setPurchasePrice booking a vendor payable.
async function chargeTransport(actor, { transporter, store, amount, date, note }) {
  const { Transporter } = initializeModels();
  return getPostgres().transaction(async (transaction) => {
    const transporterDoc = await Transporter.findByPk(transporter, { transaction });
    if (!transporterDoc) throw ApiError.notFound('Transporter not found');
    const storeDoc = await requireStore(actor, store, transaction);

    const amt = toPaisa(amount);
    if (amt <= 0) throw ApiError.badRequest('Amount must be positive');
    const when = date ? new Date(date) : new Date();
    const number = await counterService.nextDocNumber('EXP', when.getFullYear(), 6, transaction);

    return journalService.post({
      date: when,
      description: note || `Transport charge — ${transporterDoc.name}`,
      refType: REF.EXPENSE,
      refNo: number,
      store: storeDoc.id,
      createdBy: actor ? actor.id : null,
      transaction,
      lines: [
        journalService.line(ACCOUNT.OPERATING_EXPENSE, { debit: amt }),
        journalService.line(ACCOUNT.AP_TRANSPORT, { credit: amt, ref: transporterDoc.id }),
      ],
    });
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
