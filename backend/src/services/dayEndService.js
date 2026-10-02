const { Op } = require('sequelize');
const { getPostgres } = require('../db/postgres');
const { initializeModels } = require('../db/models');
const ApiError = require('../utils/ApiError');
const { ROLES } = require('../utils/constants');
const { ACCOUNT } = require('../utils/finance');
const { toPaisa, toRupees } = require('../utils/money');
const { assertStoreAccess } = require('../utils/storeScope');
const { applyWorkingDate, assertWorkingDateOpen, getWorkingDate } = require('../utils/workingDate');
const {
  isCalendarDate,
  formatReportDate,
  parseReportDate,
  reportHour,
  shiftReportDate,
} = require('../utils/reportDate');

/**
 * Late-night rule. A day opened on date D stays D's business day past
 * midnight: anything posted between 00:00 and the rollover hour on D+1 is
 * recorded as D at 11:59:59 PM (see businessTimestamp), so a shop working
 * late doesn't split one trading day across two calendar dates.
 *
 * Once the rollover hour passes with D still open, it's no longer "working
 * late" — the day was forgotten. The session is then STALE: new sales are
 * blocked (assertDayOpen) and the app asks the user to close D before doing
 * anything else. Read at call time so a .env change applies without a
 * code change; defaults to 6 AM.
 */
function rolloverHour() {
  const n = Number(process.env.DAY_ROLLOVER_HOUR);
  return Number.isInteger(n) && n >= 0 && n <= 23 ? n : 6;
}

// One of:
//  NONE       — the store has never opened a day (legacy: treated as open)
//  CLOSED     — the latest session is closed
//  CURRENT    — open, and opened today
//  LATE_NIGHT — open since yesterday, and it's still before the rollover hour
//  STALE      — open since an earlier day and the rollover hour has passed
function sessionState(session, now = new Date()) {
  if (!session) return 'NONE';
  if (!isSessionOpen(session)) return 'CLOSED';
  const today = formatReportDate(now);
  if (session.date >= today) return 'CURRENT';
  if (session.date === shiftReportDate(today, -1) && reportHour(now) < rolloverHour()) {
    return 'LATE_NIGHT';
  }
  return 'STALE';
}

function assertCalendarDate(date) {
  if (!isCalendarDate(date)) throw ApiError.badRequest('date must be in YYYY-MM-DD format');
}

async function requireStore(storeId, transaction) {
  const { Store } = initializeModels();
  const store = await Store.findByPk(storeId, { transaction });
  if (!store) throw ApiError.notFound('Store not found');
  return store;
}

// A session stays "open" once closed only if it was subsequently reopened —
// closing it again (see closeDay) clears reopenedAt.
function isSessionOpen(session) {
  return !session.closedAt || !!session.reopenedAt;
}

// A past day an admin reopened to add or change entries on it (see
// reopenDay). It sits beside the live day rather than replacing it, so it
// never counts as the store's live session.
function isEditSession(session) {
  return (
    !!session.closedAt &&
    !!session.reopenedAt &&
    session.date < formatReportDate(session.reopenedAt)
  );
}

// super_admin can act on any store; an admin can act on (and bypass the lock
// for) only the store(s) they're assigned via store_admins. Nobody else gets
// either power — matches "store admin can do anything" from product intent.
function isStoreAdminOf(actor, storeId) {
  if (!actor) return false;
  if (actor.role === ROLES.SUPER_ADMIN) return true;
  if (actor.role === ROLES.ADMIN) {
    return (actor.adminStores || []).some((s) => String(s.id) === String(storeId));
  }
  return false;
}

const USER_ATTRS = ['id', 'name'];

function withUsers() {
  const { User } = initializeModels();
  return [
    { model: User, as: 'opener', attributes: USER_ATTRS },
    { model: User, as: 'closer', attributes: USER_ATTRS },
    { model: User, as: 'reopener', attributes: USER_ATTRS },
  ];
}

const NEWEST_FIRST = [
  ['date', 'DESC'],
  ['createdAt', 'DESC'],
];

// The store's live session: its most recent one, skipping past days that
// are only reopened for editing. At most one is ever open without having
// been closed (migration 030's partial unique index).
async function latestSession(storeId, transaction) {
  const { DayEnd } = initializeModels();
  const recent = await DayEnd.findAll({
    where: { store: storeId },
    order: NEWEST_FIRST,
    include: withUsers(),
    limit: 50,
    transaction,
  });
  return recent.find((session) => !isEditSession(session)) || null;
}

// The session opened on exactly `date` (the latest, if it was opened twice).
async function sessionOnDate(storeId, date, transaction) {
  const { DayEnd } = initializeModels();
  return DayEnd.findOne({
    where: { store: storeId, date },
    order: [['createdAt', 'DESC']],
    include: withUsers(),
    transaction,
  });
}

// The session that covers business `date`: the one opened that day, else
// the live session if it's still open from an earlier day (a day stays open
// across midnights until it's closed). Null means nothing covers it — the
// day was never opened, so it reads as closed.
async function dateSession(storeId, date, transaction) {
  const own = await sessionOnDate(storeId, date, transaction);
  if (own) return own;
  const live = await latestSession(storeId, transaction);
  if (live && isSessionOpen(live) && live.date <= date) return live;
  return null;
}

// Whether `date` is open for new entries on this store.
async function isDateOpen(storeId, date, transaction) {
  const session = await dateSession(storeId, date, transaction);
  return !!session && isSessionOpen(session);
}

// What the last close before `date` left in the drawer — the cash in hand a
// day opened on `date` starts with.
async function carryForwardBefore(storeId, date, transaction) {
  const { DayEnd } = initializeModels();
  const prev = await DayEnd.findOne({
    where: { store: storeId, date: { [Op.lt]: date } },
    order: NEWEST_FIRST,
    transaction,
  });
  return prev && prev.remainingBalance != null ? prev.remainingBalance : 0;
}

// Net cash (paisa) posted to the CASH account for this store in
// [since, until) — `until` omitted means through now. Mirrors
// reportService.dayBookReport's store filter: business-wide entries (vendor
// payments, customer receipts, cash adjustments) carry no store at all, so
// they'd otherwise vanish from every store's cash-on-hand instead of
// counting toward whichever one's drawer they actually moved.
async function cashMovementSince(storeId, since, until, transaction) {
  const { JournalEntry, JournalLine } = initializeModels();
  const date = until ? { [Op.gte]: since, [Op.lt]: until } : { [Op.gte]: since };
  const entries = await JournalEntry.findAll({
    where: { [Op.or]: [{ store: null }, { store: storeId }], date },
    include: [{ model: JournalLine, as: 'lines', separate: true }],
    transaction,
  });
  let net = 0;
  for (const entry of entries) {
    for (const line of entry.lines) {
      if (line.account === ACCOUNT.CASH) net += (line.debit || 0) - (line.credit || 0);
    }
  }
  return net;
}

// The drawer cash a session accounts for: everything from its opening up to
// the next session's opening (or now, for the newest). Sessions partition
// the store's timeline this way, so a reopened past day picks up whatever
// was added to it without touching the days around it.
async function sessionCashOnHand(storeId, session, transaction) {
  const { DayEnd } = initializeModels();
  const next = await DayEnd.findOne({
    where: { store: storeId, openedAt: { [Op.gt]: session.openedAt } },
    order: [['openedAt', 'ASC']],
    transaction,
  });
  const cash = await cashMovementSince(storeId, session.openedAt, next?.openedAt, transaction);
  return session.openingBalance + cash;
}

/**
 * Store status. Without a `date`: the live session plus `state` and the
 * `businessDate` the app should default to (the open day's date while it's
 * open, even after midnight; otherwise today). With a `date`: the session
 * covering that date. A date nothing covers comes back with state NONE.
 */
async function getStatus(storeId, date) {
  const now = new Date();
  const today = formatReportDate(now);
  let session;
  if (date) {
    assertCalendarDate(date);
    session = await dateSession(storeId, date);
  } else {
    session = await latestSession(storeId);
  }
  const base = { rolloverHour: rolloverHour() };
  if (!session) {
    return { ...base, isOpen: false, state: 'NONE', businessDate: today, editing: false };
  }
  const isOpen = isSessionOpen(session);
  const editing = isEditSession(session);
  const result = {
    ...base,
    isOpen,
    editing,
    state: editing ? 'EDITING' : sessionState(session, now),
    businessDate: isOpen && !editing ? session.date : today,
    openDate: session.date,
    openedByName: session.opener?.name,
    openedAt: session.openedAt,
    openingBalance: toRupees(session.openingBalance),
  };
  if (session.closedAt) {
    result.closedByName = session.closer?.name;
    result.closedAt = session.closedAt;
  }
  if (session.handoverAmount != null) result.handoverAmount = toRupees(session.handoverAmount);
  if (!isOpen && session.remainingBalance != null) {
    result.remainingBalance = toRupees(session.remainingBalance);
  }
  if (session.reopenedAt) {
    result.reopenedByName = session.reopener?.name;
    result.reopenedAt = session.reopenedAt;
  }
  if (isOpen) result.cashOnHand = toRupees(await sessionCashOnHand(storeId, session));
  return result;
}

/**
 * Opens today's business day, starting from the cash the last close carried
 * forward (0 for a store's first day). Cash in hand is otherwise recorded
 * as a Cash In entry from Cash & Bank, not here. Past dates are never
 * opened here: they're closed, and only an admin can reopen one (reopenDay).
 */
async function openDay(actor, { store, date }) {
  const { DayEnd } = initializeModels();
  return getPostgres().transaction(async (transaction) => {
    await requireStore(store, transaction);
    assertStoreAccess(actor, store);
    const now = new Date();
    const today = formatReportDate(now);
    if (date && date !== today) {
      throw ApiError.badRequest(
        date > today
          ? 'A day cannot be opened in the future'
          : 'Previous days are closed. An admin can reopen one from the header.',
      );
    }
    const latest = await latestSession(store, transaction);
    if (latest && isSessionOpen(latest)) {
      throw ApiError.badRequest(
        latest.date === today
          ? 'The day is already open'
          : `The day opened on ${latest.date} is still open. Close it before opening another day.`,
      );
    }
    const opening = latest && latest.remainingBalance != null ? latest.remainingBalance : 0;
    return DayEnd.create(
      { store, date: today, openedBy: actor.id, openedAt: now, openingBalance: opening },
      { transaction },
    );
  });
}

// After a reopened day is closed again with a different closing balance,
// every later day started from the old figure — shift their opening (and,
// once closed, remaining) balances by the difference.
async function cascadeBalance(storeId, session, delta, transaction) {
  if (!delta) return;
  const { DayEnd } = initializeModels();
  const later = await DayEnd.findAll({
    where: { store: storeId, openedAt: { [Op.gt]: session.openedAt } },
    order: [['openedAt', 'ASC']],
    transaction,
  });
  for (const next of later) {
    next.openingBalance += delta;
    if (next.remainingBalance != null) next.remainingBalance += delta;
    await next.save({ transaction });
  }
}

/**
 * Closes a day. Without `date` (or with the live day's date): the live
 * session, as before — anyone with access to the store. With the date of a
 * past day an admin reopened: closes that one again (admin only), and if
 * its closing balance changed, carries the difference into every later day.
 */
async function closeDay(actor, { store, date, handoverAmount }) {
  const handover = toPaisa(handoverAmount || 0);
  if (handover < 0) throw ApiError.badRequest('The amount submitted cannot be negative');
  const { DayEnd } = initializeModels();
  return getPostgres().transaction(async (transaction) => {
    await requireStore(store, transaction);
    assertStoreAccess(actor, store);
    let session = date
      ? await dateSession(store, date, transaction)
      : await latestSession(store, transaction);
    if (session && !isSessionOpen(session)) {
      throw ApiError.badRequest('This day is already closed');
    }
    if (!session && date && date !== formatReportDate(new Date())) {
      throw ApiError.badRequest('This day is already closed');
    }
    if (session && isEditSession(session) && !isStoreAdminOf(actor, store)) {
      throw ApiError.forbidden('Only a super admin or this store’s admin can close a past day');
    }
    if (!session) {
      // Legacy path: this store has never explicitly opened a day. Treat it
      // as though it had been open since today so the handover flow still
      // works without forcing every store onto the Open button first.
      session = await DayEnd.create(
        {
          store,
          date: formatReportDate(new Date()),
          openedBy: actor.id,
          openedAt: new Date(),
          openingBalance: 0,
        },
        { transaction },
      );
    }
    const before = session.remainingBalance;
    const cashOnHand = await sessionCashOnHand(store, session, transaction);
    session.closedBy = actor.id;
    session.closedAt = new Date();
    session.handoverAmount = handover;
    session.remainingBalance = cashOnHand - handover;
    session.reopenedBy = null;
    session.reopenedAt = null;
    await session.save({ transaction });
    if (before != null) {
      await cascadeBalance(store, session, session.remainingBalance - before, transaction);
    }
    return session;
  });
}

/**
 * Reopens a closed day — super admin or the store's admin only. Without
 * `date`: the live (latest) session, as before. With a past `date`: that
 * day is reopened for editing alongside the live day; a past date that was
 * never opened gets its session created here, starting from what the
 * previous close carried forward.
 */
async function reopenDay(actor, { store, date }) {
  const { DayEnd } = initializeModels();
  return getPostgres().transaction(async (transaction) => {
    const storeDoc = await requireStore(store, transaction);
    if (!isStoreAdminOf(actor, storeDoc.id)) {
      throw ApiError.forbidden('Only a super admin or this store’s admin can reopen the day');
    }
    const now = new Date();
    const today = formatReportDate(now);
    const latest = await latestSession(store, transaction);
    const day = date || latest?.date;
    if (!day) throw ApiError.badRequest('This day is not currently closed');
    assertCalendarDate(day);
    if (day > today) throw ApiError.badRequest('A day in the future cannot be reopened');

    const session = await dateSession(store, day, transaction);
    if (session && isSessionOpen(session)) {
      throw ApiError.badRequest('This day is already open');
    }
    if (session) {
      session.reopenedBy = actor.id;
      session.reopenedAt = now;
      // Entries added to a past day are dated onto it at the current time
      // of day, so its session must cover the whole date.
      const startOfDay = parseReportDate(day, 'date');
      if (day < today && session.openedAt > startOfDay) session.openedAt = startOfDay;
      await session.save({ transaction });
      return session;
    }
    if (day === today) {
      throw ApiError.badRequest('Today has not been opened yet — use Open Day');
    }
    const opening = await carryForwardBefore(store, day, transaction);
    // Created closed-then-reopened, which is what marks it as a past day
    // being edited rather than the live day (isEditSession).
    return DayEnd.create(
      {
        store,
        date: day,
        openedBy: actor.id,
        openedAt: parseReportDate(day, 'date'),
        openingBalance: opening,
        closedBy: actor.id,
        closedAt: now,
        handoverAmount: 0,
        remainingBalance: opening,
        reopenedBy: actor.id,
        reopenedAt: now,
      },
      { transaction },
    );
  });
}

// Called from saleService.createSale right before a sale is actually
// created — must run inside the same transaction as the sale.
async function assertDayOpen(actor, storeId, when, transaction) {
  // A past date picked in the header is checked open by businessTimestamp
  // (utils/workingDate), which runs before this.
  if (getWorkingDate() && isStoreAdminOf(actor, storeId)) return;
  // A forgotten day blocks everyone, admins included — closing it is one
  // click, and letting sales in first would muddle which day they belong to.
  const latest = await latestSession(storeId, transaction);
  if (sessionState(latest) === 'STALE') {
    throw ApiError.forbidden(
      `The day opened on ${latest.date} was never closed. Close it before adding new sales.`,
    );
  }
  if (isStoreAdminOf(actor, storeId)) return;
  // A store that has never used Day Open/Close stays open, as before.
  if (!latest) return;
  if (!(await isDateOpen(storeId, formatReportDate(when), transaction))) {
    throw ApiError.forbidden(
      'This day is closed for this store. Ask an admin to reopen it, or open a new day, before adding more sales.',
    );
  }
}

/**
 * The timestamp a store-scoped entry made at `when` should carry. During a
 * LATE_NIGHT session (open since yesterday, before the rollover hour) any
 * entry falling on today's calendar date is moved back to 11:59:59 PM of
 * the open day. Everything else — including explicitly back-dated entries
 * and entries with no store — keeps its own time. Safe to call more than
 * once on the same value.
 */
async function businessTimestamp(storeId, when, transaction) {
  // An admin's header-picked working date takes precedence over everything
  // below (see utils/workingDate) — it moves today's entries off today, and
  // only once that past day has been reopened.
  await assertWorkingDateOpen(transaction);
  const at = applyWorkingDate(when);
  if (!storeId) return at;
  const now = new Date();
  if (formatReportDate(at) !== formatReportDate(now)) return at;
  const session = await latestSession(storeId, transaction);
  if (sessionState(session, now) !== 'LATE_NIGHT') return at;
  return parseReportDate(session.date, 'date', { endOfDay: true });
}

module.exports = {
  getStatus,
  openDay,
  closeDay,
  reopenDay,
  assertDayOpen,
  businessTimestamp,
  sessionState,
  isDateOpen,
};
