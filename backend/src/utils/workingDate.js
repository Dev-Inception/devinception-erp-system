const { AsyncLocalStorage } = require('async_hooks');
const ApiError = require('./ApiError');
const { ROLES } = require('./constants');
const { formatReportDate, isCalendarDate, parseReportDate } = require('./reportDate');

/**
 * The "working date" a super admin or store admin picked in the header.
 * It rides along on every request as the X-Business-Date header and is held
 * here for the rest of that request, so everything the request creates —
 * sales, expenses, payments, ledger postings, stock movements — lands on
 * that date instead of today, without each endpoint taking its own date.
 *
 * Only honoured for admins, and only for a past date: for today (or when
 * the header is absent) entries keep their normal timestamps, including the
 * late-night rule in dayEndService.businessTimestamp.
 */
const storage = new AsyncLocalStorage();

const HEADER = 'x-business-date';
const STORE_HEADER = 'x-store-id';

function canPickDate(user) {
  return !!user && (user.role === ROLES.SUPER_ADMIN || user.role === ROLES.ADMIN);
}

// Express middleware — must run after `protect` so req.user is set. The
// store is the one picked in the header, sent alongside as X-Store-Id.
function workingDateContext(req, _res, next) {
  const value = req.headers[HEADER];
  const today = formatReportDate(new Date());
  const workingDate =
    canPickDate(req.user) && isCalendarDate(value) && value < today ? value : null;
  storage.run({ workingDate, store: req.headers[STORE_HEADER] || null, checked: false }, next);
}

/**
 * Past days are closed: an admin can only add or change things on one after
 * reopening it from the header. Called wherever an entry gets its date
 * (journalService.post, dayEndService.businessTimestamp), so anything that
 * would land on a closed past day is refused — and nothing else (logging
 * out, settings, …) is affected. Checked once per request.
 */
async function assertWorkingDateOpen(transaction) {
  const ctx = storage.getStore();
  if (!ctx?.workingDate || ctx.checked) return;
  if (!ctx.store) throw ApiError.badRequest('Pick a store before working on a past date');
  // Required lazily: dayEndService itself depends on this module.
  const { isDateOpen } = require('../services/dayEndService');
  if (!(await isDateOpen(ctx.store, ctx.workingDate, transaction))) {
    throw ApiError.forbidden(
      `${ctx.workingDate} is closed. Reopen it from the header before adding or changing anything on it.`,
    );
  }
  ctx.checked = true;
}

function getWorkingDate() {
  return storage.getStore()?.workingDate || null;
}

/**
 * Moves a timestamp that falls on today onto the working date, keeping its
 * time of day on the business clock (so entries still sort in the order they
 * were made). Anything already dated to another day is left alone, which
 * also makes this safe to apply more than once.
 */
function applyWorkingDate(when) {
  const at = when ? new Date(when) : new Date();
  const workingDate = getWorkingDate();
  if (!workingDate) return at;
  const today = formatReportDate(new Date());
  if (formatReportDate(at) !== today) return at;
  const sinceMidnight = at.getTime() - parseReportDate(today, 'date').getTime();
  return new Date(parseReportDate(workingDate, 'date').getTime() + sinceMidnight);
}

module.exports = {
  workingDateContext,
  getWorkingDate,
  applyWorkingDate,
  assertWorkingDateOpen,
  canPickDate,
};
