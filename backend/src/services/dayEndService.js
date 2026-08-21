const DayEnd = require('../models/dayEndModel');
const Store = require('../models/storeModel');
const ApiError = require('../utils/ApiError');
const { ROLES } = require('../utils/constants');
const { isCalendarDate, formatReportDate } = require('../utils/reportDate');

/**
 * Closes a store's business day so cashiers can no longer add sales dated
 * that day — a manager-level control, with a super admin able to bypass the
 * lock entirely or reopen a day closed by mistake. See dayEndModel.js for why
 * one doc per store+date is enough to represent the whole open/close/reopen
 * history.
 */

function assertCalendarDate(date) {
  if (!isCalendarDate(date)) throw ApiError.badRequest('date must be in YYYY-MM-DD format');
}

async function requireStore(storeId) {
  const store = await Store.findById(storeId);
  if (!store) throw ApiError.notFound('Store not found');
  return store;
}

async function getStatus(storeId, date) {
  assertCalendarDate(date);
  const doc = await DayEnd.findOne({ store: storeId, date })
    .populate('closedBy', 'name')
    .populate('reopenedBy', 'name');
  const isOpen = !doc || !!doc.reopenedAt;
  return {
    isOpen,
    closedBy: doc && !doc.reopenedAt ? doc.closedBy : null,
    closedAt: doc && !doc.reopenedAt ? doc.closedAt : null,
    reopenedBy: doc ? doc.reopenedBy : null,
    reopenedAt: doc ? doc.reopenedAt : null,
  };
}

async function closeDay(actor, { store, date }) {
  assertCalendarDate(date);
  await requireStore(store);

  const existing = await DayEnd.findOne({ store, date });
  if (existing && !existing.reopenedAt) {
    throw ApiError.badRequest('This day is already closed');
  }

  if (existing) {
    existing.closedBy = actor._id;
    existing.closedAt = new Date();
    existing.reopenedBy = null;
    existing.reopenedAt = null;
    await existing.save();
    return existing;
  }
  return DayEnd.create({ store, date, closedBy: actor._id });
}

async function reopenDay(actor, { store, date }) {
  assertCalendarDate(date);
  await requireStore(store);

  const existing = await DayEnd.findOne({ store, date });
  if (!existing || existing.reopenedAt) {
    throw ApiError.badRequest('This day is not currently closed');
  }
  existing.reopenedBy = actor._id;
  existing.reopenedAt = new Date();
  await existing.save();
  return existing;
}

// Called from saleService.createSale right before a sale is actually
// created. A super admin bypasses the lock entirely; everyone else is
// blocked once the sale's own business date has been closed for its store.
async function assertDayOpen(actor, storeId, when) {
  if (actor && actor.role === ROLES.SUPER_ADMIN) return;
  const date = formatReportDate(when);
  const doc = await DayEnd.findOne({ store: storeId, date });
  if (doc && !doc.reopenedAt) {
    throw ApiError.forbidden(
      'This day is closed for this store. Ask a super admin to reopen it before adding more sales.',
    );
  }
}

module.exports = { getStatus, closeDay, reopenDay, assertDayOpen };
