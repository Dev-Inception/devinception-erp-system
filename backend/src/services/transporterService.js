const { Op } = require('sequelize');
const { initializeModels } = require('../db/models');
const ApiError = require('../utils/ApiError');
const journalService = require('./journalService');
const counterService = require('./counterService');
const { ACCOUNT, REF } = require('../utils/finance');
const { toPaisa, toRupees } = require('../utils/money');
const { parsePagination } = require('../utils/query');
const { Transporter, Store } = initializeModels();
const actorId = (actor) => actor && (actor.id || actor._id);
const writable = ({ name, phone, vehicleNumber, address }) =>
  Object.fromEntries(
    Object.entries({ name, phone, vehicleNumber, address }).filter(
      ([, value]) => value !== undefined,
    ),
  );
async function listTransporters(query = {}) {
  const {
    page,
    limit,
    skip: offset,
  } = parsePagination(query, { defaultLimit: 1000, maxLimit: 100000 });
  const where = query.search
    ? {
        [Op.or]: ['name', 'phone', 'vehicleNumber'].map((field) => ({
          [field]: { [Op.iLike]: `%${query.search}%` },
        })),
      }
    : {};
  const [{ rows, count }, balances] = await Promise.all([
    Transporter.findAndCountAll({ where, order: [['createdAt', 'DESC']], limit, offset }),
    journalService.balancesByRef(ACCOUNT.AP_TRANSPORT, { store: query.store }),
  ]);
  return {
    transporters: rows.map((r) => ({
      ...r.toJSON(),
      outstanding: toRupees(balances.get(r.id) || 0),
    })),
    total: count,
    page,
    limit,
  };
}
async function getTransporterById(id) {
  const row = await Transporter.findByPk(id);
  if (!row) throw ApiError.notFound('Transporter not found');
  return row;
}
const createTransporter = (data) => Transporter.create(writable(data));
async function updateTransporter(id, data) {
  return (await getTransporterById(id)).update(writable(data));
}
async function deleteTransporter(id) {
  const row = await getTransporterById(id);
  if (Number(row.outstanding) > 0)
    throw ApiError.badRequest('Transporter has an outstanding balance and cannot be deleted');
  await row.destroy();
}
async function chargeTransport(actor, { transporter, store, amount, date, note }) {
  const tr = await getTransporterById(transporter);
  if (!(await Store.findByPk(store))) throw ApiError.badRequest('A store is required');
  const value = toPaisa(amount);
  if (value <= 0) throw ApiError.badRequest('Amount must be positive');
  const when = date ? new Date(date) : new Date();
  const number = await counterService.nextDocNumber('EXP', when.getFullYear(), 6);
  return journalService.post({
    date: when,
    description: note || `Transport charge — ${tr.name}`,
    refType: REF.EXPENSE,
    refNo: number,
    store,
    createdBy: actorId(actor),
    lines: [
      journalService.line(ACCOUNT.OPERATING_EXPENSE, { debit: value }),
      journalService.line(ACCOUNT.AP_TRANSPORT, { credit: value, ref: tr.id }),
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
