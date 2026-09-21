const { Op } = require('sequelize');
const { getPostgres } = require('../db/postgres');
const { initializeModels } = require('../db/models');
const ApiError = require('../utils/ApiError');
const { ROLES } = require('../utils/constants');
const { ACCOUNT } = require('../utils/finance');
const { toPaisa, toRupees } = require('../utils/money');
const { assertStoreAccess } = require('../utils/storeScope');
const { isCalendarDate, formatReportDate } = require('../utils/reportDate');

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
// closing it again (see closeDay) clears reopenedAt, so this always reflects
// the true current state of the *latest* session row for a store.
function isSessionOpen(session) {
  return !session.closedAt || !!session.reopenedAt;
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

// The single most recent session row for a store, regardless of date —
// there is at most one *open* session per store (see the partial unique
// index in migration 023), but there can be many closed ones.
async function latestSession(storeId, transaction) {
  const { DayEnd, User } = initializeModels();
  return DayEnd.findOne({
    where: { store: storeId },
    order: [
      ['date', 'DESC'],
      ['createdAt', 'DESC'],
    ],
    include: [
      { model: User, as: 'opener', attributes: USER_ATTRS },
      { model: User, as: 'closer', attributes: USER_ATTRS },
      { model: User, as: 'reopener', attributes: USER_ATTRS },
    ],
    transaction,
  });
}

// The session that covers a given business `date` — the most recent one
// opened on or before it. Whether it's "open" is a property of the session
// itself (isSessionOpen), not of `date`: an open session covers every date
// from when it opened through today, no matter how many midnights have
// passed since — that's the whole point of a day staying open until closed.
async function resolveSessionForDate(storeId, date, transaction) {
  const { DayEnd, User } = initializeModels();
  const session = await DayEnd.findOne({
    where: { store: storeId, date: { [Op.lte]: date } },
    order: [
      ['date', 'DESC'],
      ['createdAt', 'DESC'],
    ],
    include: [
      { model: User, as: 'opener', attributes: USER_ATTRS },
      { model: User, as: 'closer', attributes: USER_ATTRS },
      { model: User, as: 'reopener', attributes: USER_ATTRS },
    ],
    transaction,
  });
  // No session ever opened on/before `date` — a store that hasn't touched
  // this feature yet defaults to open, same as before this feature existed.
  if (!session) return { session: null, isOpen: true };
  return { session, isOpen: isSessionOpen(session) };
}

// Net cash (paisa) posted to the CASH account for this store from `since`
// through now — the drawer's movement across the whole open session, which
// may span several calendar dates. Mirrors reportService.dayBookReport's
// store filter: business-wide entries (vendor payments, customer receipts,
// cash adjustments) carry no store at all, so they'd otherwise vanish from
// every store's cash-on-hand instead of counting toward whichever one's
// drawer they actually moved.
async function cashMovementSince(storeId, since, transaction) {
  const { JournalEntry, JournalLine } = initializeModels();
  const entries = await JournalEntry.findAll({
    where: { [Op.or]: [{ store: null }, { store: storeId }], date: { [Op.gte]: since } },
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

async function getStatus(storeId, date) {
  assertCalendarDate(date);
  const { session, isOpen } = await resolveSessionForDate(storeId, date);
  if (!session) return { isOpen: true };

  const result = {
    isOpen,
    openDate: session.date,
    openedByName: session.opener?.name,
    openedAt: session.openedAt,
    openingBalance: toRupees(session.openingBalance),
  };
  if (!isOpen) {
    result.closedByName = session.closer?.name;
    result.closedAt = session.closedAt;
    result.handoverAmount =
      session.handoverAmount != null ? toRupees(session.handoverAmount) : null;
    result.remainingBalance =
      session.remainingBalance != null ? toRupees(session.remainingBalance) : null;
  }
  if (session.reopenedAt) {
    result.reopenedByName = session.reopener?.name;
    result.reopenedAt = session.reopenedAt;
  }
  if (isOpen) {
    const cash = await cashMovementSince(storeId, session.openedAt);
    result.cashOnHand = toRupees(session.openingBalance + cash);
  }
  return result;
}

async function openDay(actor, { store }) {
  const { DayEnd } = initializeModels();
  return getPostgres().transaction(async (transaction) => {
    await requireStore(store, transaction);
    assertStoreAccess(actor, store);
    const latest = await latestSession(store, transaction);
    if (latest && isSessionOpen(latest)) {
      throw ApiError.badRequest('The day is already open');
    }
    const openingBalance = latest && latest.remainingBalance != null ? latest.remainingBalance : 0;
    return DayEnd.create(
      {
        store,
        date: formatReportDate(new Date()),
        openedBy: actor.id,
        openedAt: new Date(),
        openingBalance,
      },
      { transaction },
    );
  });
}

async function closeDay(actor, { store, handoverAmount }) {
  const handover = toPaisa(handoverAmount);
  if (handover < 0) throw ApiError.badRequest('The amount submitted cannot be negative');
  const { DayEnd } = initializeModels();
  return getPostgres().transaction(async (transaction) => {
    await requireStore(store, transaction);
    assertStoreAccess(actor, store);
    let session = await latestSession(store, transaction);
    if (session && !isSessionOpen(session)) {
      throw ApiError.badRequest('This day is already closed');
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
    const cash = await cashMovementSince(store, session.openedAt, transaction);
    const cashOnHand = session.openingBalance + cash;
    session.closedBy = actor.id;
    session.closedAt = new Date();
    session.handoverAmount = handover;
    session.remainingBalance = cashOnHand - handover;
    session.reopenedBy = null;
    session.reopenedAt = null;
    await session.save({ transaction });
    return session;
  });
}

async function reopenDay(actor, { store }) {
  return getPostgres().transaction(async (transaction) => {
    const storeDoc = await requireStore(store, transaction);
    if (!isStoreAdminOf(actor, storeDoc.id)) {
      throw ApiError.forbidden('Only a super admin or this store’s admin can reopen the day');
    }
    const session = await latestSession(store, transaction);
    if (!session || isSessionOpen(session)) {
      throw ApiError.badRequest('This day is not currently closed');
    }
    session.reopenedBy = actor.id;
    session.reopenedAt = new Date();
    await session.save({ transaction });
    return session;
  });
}

// Called from saleService.createSale right before a sale is actually
// created — must run inside the same transaction as the sale.
async function assertDayOpen(actor, storeId, when, transaction) {
  if (isStoreAdminOf(actor, storeId)) return;
  const date = formatReportDate(when);
  const { isOpen } = await resolveSessionForDate(storeId, date, transaction);
  if (!isOpen) {
    throw ApiError.forbidden(
      'This day is closed for this store. Ask an admin to reopen it, or open a new day, before adding more sales.',
    );
  }
}

module.exports = { getStatus, openDay, closeDay, reopenDay, assertDayOpen };
