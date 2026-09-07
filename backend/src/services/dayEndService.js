const { initializeModels } = require('../db/models');
const ApiError = require('../utils/ApiError');
const { ROLES } = require('../utils/constants');
const { isCalendarDate, formatReportDate } = require('../utils/reportDate');
const { DayEnd, Store, User } = initializeModels();
const actorId = (actor) => actor.id || actor._id;
function valid(date) {
  if (!isCalendarDate(date)) throw ApiError.badRequest('date must be in YYYY-MM-DD format');
}
async function requireStore(id) {
  if (!(await Store.findByPk(id))) throw ApiError.notFound('Store not found');
}
async function getStatus(store, date) {
  valid(date);
  const row = await DayEnd.findOne({
    where: { store, date },
    include: [
      { model: User, as: 'closedByInfo', required: false },
      { model: User, as: 'reopenedByInfo', required: false },
    ],
  }).catch(() => DayEnd.findOne({ where: { store, date } }));
  return {
    isOpen: !row || Boolean(row.reopenedAt),
    closedBy: row && !row.reopenedAt ? row.closedByInfo || row.closedBy : null,
    closedAt: row && !row.reopenedAt ? row.closedAt : null,
    reopenedBy: row ? row.reopenedByInfo || row.reopenedBy : null,
    reopenedAt: row ? row.reopenedAt : null,
  };
}
async function closeDay(actor, { store, date }) {
  valid(date);
  await requireStore(store);
  const [row, created] = await DayEnd.findOrCreate({
    where: { store, date },
    defaults: { closedBy: actorId(actor) },
  });
  if (!created && !row.reopenedAt) throw ApiError.badRequest('This day is already closed');
  if (!created)
    await row.update({
      closedBy: actorId(actor),
      closedAt: new Date(),
      reopenedBy: null,
      reopenedAt: null,
    });
  return row;
}
async function reopenDay(actor, { store, date }) {
  valid(date);
  await requireStore(store);
  const row = await DayEnd.findOne({ where: { store, date } });
  if (!row || row.reopenedAt) throw ApiError.badRequest('This day is not currently closed');
  return row.update({ reopenedBy: actorId(actor), reopenedAt: new Date() });
}
async function assertDayOpen(actor, store, when) {
  if (actor && actor.role === ROLES.SUPER_ADMIN) return;
  const row = await DayEnd.findOne({ where: { store, date: formatReportDate(when) } });
  if (row && !row.reopenedAt)
    throw ApiError.forbidden(
      'This day is closed for this store. Ask a super admin to reopen it before adding more sales.',
    );
}
module.exports = { getStatus, closeDay, reopenDay, assertDayOpen };
