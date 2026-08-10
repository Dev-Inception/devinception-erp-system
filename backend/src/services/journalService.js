const mongoose = require('mongoose');
const JournalEntry = require('../models/journalEntryModel');
const ApiError = require('../utils/ApiError');
const { naturalBalance } = require('../utils/finance');

/**
 * The ledger engine. Everything that moves money posts through `post()`, and
 * every financial view (party statement, cash book, reports) is a read over
 * the resulting journal lines. Amounts are integer paisa throughout.
 */

// Build a single journal line. Pass either a positive `debit` or `credit`.
function line(account, { debit = 0, credit = 0, ref = null } = {}) {
  return { account, ref, debit, credit };
}

/**
 * Append an immutable journal entry. The model enforces that lines are
 * balanced; we re-check here so callers get a clean 400 instead of a Mongoose
 * ValidationError, and drop any zero/zero lines defensively.
 */
async function post({
  date,
  description = '',
  refType,
  refId = null,
  refNo = '',
  warehouse = null,
  store = null,
  lines,
  createdBy = null,
}) {
  const clean = (lines || []).filter((l) => (l.debit || 0) > 0 || (l.credit || 0) > 0);

  let debit = 0;
  let credit = 0;
  for (const l of clean) {
    debit += l.debit || 0;
    credit += l.credit || 0;
  }
  if (clean.length < 2 || debit !== credit) {
    throw ApiError.badRequest('Internal posting is not balanced');
  }

  return JournalEntry.create({
    date: date || new Date(),
    description,
    refType,
    refId,
    refNo,
    warehouse,
    store,
    lines: clean,
    createdBy,
  });
}

// Match expression selecting lines for one account (ref null for singletons).
function accountMatch(account, ref = null) {
  return { 'lines.account': account, 'lines.ref': ref || null };
}

/**
 * Current natural balance (paisa) for an account: positive means the expected
 * direction — cash on hand, a customer's receivable, a vendor's payable, etc.
 */
async function accountBalance(account, ref = null, { store } = {}) {
  const totals = await accountTotals(account, ref, { store });
  return naturalBalance(account, totals.debit, totals.credit);
}

// Raw debit/credit totals (paisa) for an account over an optional date range.
async function accountTotals(
  account,
  ref = null,
  { from, to, refType, refIds, warehouse, store } = {},
) {
  const entryMatch = {};
  if (from || to) {
    entryMatch.date = {};
    if (from) entryMatch.date.$gte = from;
    if (to) entryMatch.date.$lte = to;
  }
  if (refType) entryMatch.refType = refType;
  if (Array.isArray(refIds)) entryMatch.refId = { $in: refIds };
  if (warehouse) entryMatch.warehouse = warehouse;
  if (store) {
    // Entries from before store-tracking existed carry no store at all —
    // always include those alongside the selected store's own, rather than
    // making that activity disappear entirely. Aggregation `$match` doesn't
    // auto-cast query strings like `.find()` does, so cast explicitly —
    // callers pass either a plain string id or an already-cast ObjectId.
    const storeId =
      store instanceof mongoose.Types.ObjectId ? store : new mongoose.Types.ObjectId(store);
    entryMatch.$or = [{ store: null }, { store: storeId }];
  }

  const rows = await JournalEntry.aggregate([
    ...(Object.keys(entryMatch).length ? [{ $match: entryMatch }] : []),
    { $unwind: '$lines' },
    { $match: accountMatch(account, ref) },
    {
      $group: {
        _id: null,
        debit: { $sum: '$lines.debit' },
        credit: { $sum: '$lines.credit' },
      },
    },
  ]);

  return rows[0] ? { debit: rows[0].debit, credit: rows[0].credit } : { debit: 0, credit: 0 };
}

/**
 * Account statement: opening balance + each entry that touches the account
 * within [from, to], with a running balance. Used for party ledgers and the
 * cash/bank book. Returns paisa; the controller converts to rupees.
 */
async function accountStatement(account, ref = null, { from, to, store } = {}) {
  // Opening balance = everything strictly before `from`.
  let opening = 0;
  if (from) {
    const before = await accountTotals(account, ref, {
      to: new Date(from.getTime() - 1),
      store,
    });
    opening = naturalBalance(account, before.debit, before.credit);
  }

  const entryMatch = { ...accountMatch(account, ref) };
  if (from || to) {
    entryMatch.date = {};
    if (from) entryMatch.date.$gte = from;
    if (to) entryMatch.date.$lte = to;
  }
  if (store) entryMatch.store = store;

  const entries = await JournalEntry.find(entryMatch).sort({ date: 1, createdAt: 1 }).lean();

  let running = opening;
  const rows = entries.map((e) => {
    // Sum this account's lines within the entry (usually one).
    let debit = 0;
    let credit = 0;
    for (const l of e.lines) {
      if (l.account === account && String(l.ref || null) === String(ref || null)) {
        debit += l.debit || 0;
        credit += l.credit || 0;
      }
    }
    running += naturalBalance(account, debit, credit);
    return {
      date: e.date,
      description: e.description,
      refType: e.refType,
      refNo: e.refNo,
      debit,
      credit,
      balance: running,
    };
  });

  const closing = running;
  return { opening, rows, closing };
}

/**
 * Natural balances (paisa) for every `ref` under an account kind, in one
 * aggregation. Used to list all customer receivables / vendor payables at once
 * without a query per party. Returns Map<refIdString, balancePaisa>.
 * Optionally scoped to one store's transactions with each party.
 */
async function balancesByRef(account, { store } = {}) {
  const validStore = store && mongoose.isValidObjectId(store) ? store : null;
  // Entries from before store-tracking existed (or genuinely business-wide
  // ones) carry no store at all — always include those alongside the
  // selected store's own, rather than making that debt disappear entirely.
  const storeMatch = validStore
    ? [{ $match: { $or: [{ store: null }, { store: new mongoose.Types.ObjectId(validStore) }] } }]
    : [];
  const rows = await JournalEntry.aggregate([
    ...storeMatch,
    { $unwind: '$lines' },
    { $match: { 'lines.account': account } },
    {
      $group: {
        _id: '$lines.ref',
        debit: { $sum: '$lines.debit' },
        credit: { $sum: '$lines.credit' },
      },
    },
  ]);

  const map = new Map();
  for (const r of rows) {
    if (!r._id) continue;
    map.set(String(r._id), naturalBalance(account, r.debit, r.credit));
  }
  return map;
}

module.exports = {
  line,
  post,
  accountBalance,
  accountTotals,
  accountStatement,
  balancesByRef,
};
