const { getPostgres } = require('../db/postgres');
const { initializeModels } = require('../db/models');
const ApiError = require('../utils/ApiError');
const { ROLES } = require('../utils/constants');
const { isCalendarDate, formatReportDate } = require('../utils/reportDate');

/**
 * Closes a store's business day so cashiers can no longer add sales dated
 * that day — a manager-level control, with a super admin able to bypass the
 * lock entirely or reopen a day closed by mistake. One row per store+date
 * represents the whole open/close/reopen history (see db/models/dayEndModel.js).
 */

function assertCalendarDate(date) {
  if (!isCalendarDate(date)) throw ApiError.badRequest('date must be in YYYY-MM-DD format');
}

async function requireStore(storeId, transaction) {
  const { Store } = initializeModels();
  const store = await Store.findByPk(storeId, { transaction });
  if (!store) throw ApiError.notFound('Store not found');
  return store;
}

async function getStatus(storeId, date) {
  assertCalendarDate(date);
  const { DayEnd, User } = initializeModels();
  const doc = await DayEnd.findOne({
    where: { store: storeId, date },
    include: [
      { model: User, as: 'closer', attributes: ['id', 'name'] },
      { model: User, as: 'reopener', attributes: ['id', 'name'] },
    ],
  });
  const isOpen = !doc || !!doc.reopenedAt;
  // Prefer the populated `closer`/`reopener` (name + id) the frontend
  // expects in place of the raw ref, same as Mongo's `.populate()` did;
  // degrade to the bare id if a query path ever skips the include.
  return {
    isOpen,
    closedBy: doc && !doc.reopenedAt ? (doc.closer ?? doc.closedBy) : null,
    closedAt: doc && !doc.reopenedAt ? doc.closedAt : null,
    reopenedBy: doc ? (doc.reopener ?? doc.reopenedBy) : null,
    reopenedAt: doc ? doc.reopenedAt : null,
  };
}

async function closeDay(actor, { store, date }) {
  assertCalendarDate(date);
  const { DayEnd } = initializeModels();
  return getPostgres().transaction(async (transaction) => {
    await requireStore(store, transaction);
    const existing = await DayEnd.findOne({ where: { store, date }, transaction });
    if (existing && !existing.reopenedAt) {
      throw ApiError.badRequest('This day is already closed');
    }

    if (existing) {
      existing.closedBy = actor.id;
      existing.closedAt = new Date();
      existing.reopenedBy = null;
      existing.reopenedAt = null;
      await existing.save({ transaction });
      return existing;
    }
    return DayEnd.create({ store, date, closedBy: actor.id }, { transaction });
  });
}

async function reopenDay(actor, { store, date }) {
  assertCalendarDate(date);
  const { DayEnd } = initializeModels();
  return getPostgres().transaction(async (transaction) => {
    await requireStore(store, transaction);
    const existing = await DayEnd.findOne({ where: { store, date }, transaction });
    if (!existing || existing.reopenedAt) {
      throw ApiError.badRequest('This day is not currently closed');
    }
    existing.reopenedBy = actor.id;
    existing.reopenedAt = new Date();
    await existing.save({ transaction });
    return existing;
  });
}

// Called from saleService.createSale right before a sale is actually
// created — must run inside the same transaction as the sale so both commit
// or roll back together. A super admin bypasses the lock entirely; everyone
// else is blocked once the sale's own business date has been closed for its
// store.
async function assertDayOpen(actor, storeId, when, transaction) {
  if (actor && actor.role === ROLES.SUPER_ADMIN) return;
  const { DayEnd } = initializeModels();
  const date = formatReportDate(when);
  const doc = await DayEnd.findOne({ where: { store: storeId, date }, transaction });
  if (doc && !doc.reopenedAt) {
    throw ApiError.forbidden(
      'This day is closed for this store. Ask a super admin to reopen it before adding more sales.',
    );
  }
}

module.exports = { getStatus, closeDay, reopenDay, assertDayOpen };
