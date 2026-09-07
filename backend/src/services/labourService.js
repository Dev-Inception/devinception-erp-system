const { Op } = require('sequelize');
const { initializeModels } = require('../db/models');
const ApiError = require('../utils/ApiError');
const journalService = require('./journalService');
const { ACCOUNT } = require('../utils/finance');
const { toPaisa } = require('../utils/money');
const { Labour } = initializeModels();
async function listLabour() {
  const [rows, balances] = await Promise.all([
    Labour.findAll({ order: [['createdAt', 'DESC']] }),
    journalService.balancesByRef(ACCOUNT.AP_LABOUR),
  ]);
  return rows.map((r) => ({ ...r.toJSON(), outstanding: balances.get(r.id) || 0 }));
}
async function getLabourById(id) {
  const row = await Labour.findByPk(id);
  if (!row) throw ApiError.notFound('Labour not found');
  return row;
}
async function createLabour(data) {
  if (await Labour.findOne({ where: { phoneNumber: data.phoneNumber } }))
    throw ApiError.conflict('Labour with this phone number already exists');
  return Labour.create(data);
}
async function updateLabour(id, data) {
  const row = await getLabourById(id);
  if (
    data.phoneNumber &&
    data.phoneNumber !== row.phoneNumber &&
    (await Labour.findOne({ where: { phoneNumber: data.phoneNumber } }))
  )
    throw ApiError.conflict('Labour with this phone number already exists');
  return row.update(Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined)));
}
async function deleteLabour(id) {
  const row = await getLabourById(id);
  await row.destroy();
  return row;
}
async function resolveLabourLines(input = []) {
  const ids = [
    ...new Set(input.map((l) => String(typeof l === 'object' ? l.labour : l)).filter(Boolean)),
  ];
  const rows = ids.length ? await Labour.findAll({ where: { id: { [Op.in]: ids } } }) : [];
  if (rows.length !== ids.length)
    throw ApiError.badRequest('One or more labour entries are invalid');
  const rent = new Map(
    input.filter((l) => typeof l === 'object').map((l) => [String(l.labour), toPaisa(l.rent || 0)]),
  );
  return rows.map((r) => ({
    labour: r.id,
    name: r.name,
    phoneNumber: r.phoneNumber,
    rent: rent.get(r.id) || 0,
  }));
}
async function labourPost(lines, options, reverse) {
  const charged = lines.filter((l) => l.rent > 0);
  if (!charged.length) return;
  const total = charged.reduce((sum, l) => sum + l.rent, 0);
  const payable = charged.map((l) =>
    journalService.line(ACCOUNT.AP_LABOUR, {
      [reverse ? 'debit' : 'credit']: l.rent,
      ref: l.labour,
    }),
  );
  return journalService.post({
    date: options.when,
    description: `${reverse ? 'Reversal of labour charges for edited' : 'Labour charges for'} ${options.label} ${options.refNo}`,
    refType: options.refType,
    refNo: options.refNo,
    store: options.store,
    createdBy: options.actor && (options.actor.id || options.actor._id),
    lines: reverse
      ? [...payable, journalService.line(ACCOUNT.OPERATING_EXPENSE, { credit: total })]
      : [journalService.line(ACCOUNT.OPERATING_EXPENSE, { debit: total }), ...payable],
  });
}
const postLabourPayable = (lines, options) => labourPost(lines, options, false);
const reverseLabourPayable = (lines, options) => labourPost(lines, options, true);
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
