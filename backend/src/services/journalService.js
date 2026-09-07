const { QueryTypes } = require('sequelize');
const { getPostgres } = require('../db/postgres');
const { initializeModels } = require('../db/models');
const ApiError = require('../utils/ApiError');
const { naturalBalance } = require('../utils/finance');

/**
 * The ledger engine. Everything that moves money posts through `post()`, and
 * every financial view (party statement, cash book, reports) is a read over
 * the resulting journal_lines rows. Amounts are integer paisa throughout.
 *
 * Entries are append-only — corrections are posted as a reversing entry,
 * never an edit/delete (the balanced-lines constraint trigger on
 * journal_lines would reject deleting an entry's lines down to fewer than 2
 * anyway; see migration 001's enforce_balanced_journal_entry()).
 */

// Build a single journal line. Pass either a positive `debit` or `credit`.
function line(account, { debit = 0, credit = 0, ref = null } = {}) {
  return { account, ref, debit, credit };
}

/**
 * Append an immutable journal entry (+ its lines) inside the caller's
 * transaction. Re-validates balance here so callers get a clean 400 instead
 * of the raw deferred-constraint-trigger exception at commit time.
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
  transaction,
}) {
  const { JournalEntry, JournalLine } = initializeModels();
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

  const entry = await JournalEntry.create(
    { date: date || new Date(), description, refType, refId, refNo, warehouse, store, createdBy },
    { transaction },
  );
  await JournalLine.bulkCreate(
    clean.map((l, position) => ({
      journalEntryId: entry.id,
      position,
      account: l.account,
      ref: l.ref,
      debit: l.debit || 0,
      credit: l.credit || 0,
    })),
    { transaction },
  );
  return entry;
}

/**
 * Current natural balance (paisa) for an account: positive means the expected
 * direction — cash on hand, a customer's receivable, a vendor's payable, etc.
 */
async function accountBalance(account, ref = null, { store, transaction } = {}) {
  const totals = await accountTotals(account, ref, { store, transaction });
  return naturalBalance(account, totals.debit, totals.credit);
}

// Raw debit/credit totals (paisa) for an account over an optional date range.
// Entries from before store-tracking existed carry no store at all — those
// always count alongside the selected store's own, rather than making that
// activity disappear entirely.
async function accountTotals(
  account,
  ref = null,
  { from, to, refType, refIds, warehouse, store, transaction } = {},
) {
  const conditions = ['jl.account = :account', 'jl.ref_id IS NOT DISTINCT FROM :ref'];
  const replacements = { account, ref };

  if (from) {
    conditions.push('je.date >= :from');
    replacements.from = from;
  }
  if (to) {
    conditions.push('je.date <= :to');
    replacements.to = to;
  }
  if (refType) {
    conditions.push('je.ref_type = :refType');
    replacements.refType = refType;
  }
  if (Array.isArray(refIds)) {
    conditions.push('je.ref_id = ANY(:refIds)');
    replacements.refIds = refIds;
  }
  if (warehouse) {
    conditions.push('je.warehouse_id = :warehouse');
    replacements.warehouse = warehouse;
  }
  if (store) {
    conditions.push('(je.store_id = :store OR je.store_id IS NULL)');
    replacements.store = store;
  }

  const [row] = await getPostgres().query(
    `SELECT COALESCE(SUM(jl.debit), 0) AS debit, COALESCE(SUM(jl.credit), 0) AS credit
     FROM journal_lines jl
     JOIN journal_entries je ON je.id = jl.journal_entry_id
     WHERE ${conditions.join(' AND ')}`,
    { replacements, transaction, type: QueryTypes.SELECT },
  );
  return { debit: row.debit, credit: row.credit };
}

/**
 * Account statement: opening balance + each entry that touches the account
 * within [from, to], with a running balance. Used for party ledgers and the
 * cash/bank book. Returns paisa; the controller converts to rupees.
 */
async function accountStatement(account, ref = null, { from, to, store, transaction } = {}) {
  // Opening balance = everything strictly before `from` (includes
  // null-store legacy entries, via accountTotals' store fallback).
  let opening = 0;
  if (from) {
    const before = await accountTotals(account, ref, {
      to: new Date(from.getTime() - 1),
      store,
      transaction,
    });
    opening = naturalBalance(account, before.debit, before.credit);
  }

  const conditions = ['jl.account = :account', 'jl.ref_id IS NOT DISTINCT FROM :ref'];
  const replacements = { account, ref };
  if (from) {
    conditions.push('je.date >= :from');
    replacements.from = from;
  }
  if (to) {
    conditions.push('je.date <= :to');
    replacements.to = to;
  }
  // Unlike accountTotals, the itemized rows below use strict store equality
  // (no null-store fallback) — matches the original behavior exactly.
  if (store) {
    conditions.push('je.store_id = :store');
    replacements.store = store;
  }

  const entries = await getPostgres().query(
    `SELECT je.id, je.date, je.description, je.ref_type AS "refType", je.ref_no AS "refNo",
            COALESCE(SUM(jl.debit), 0) AS debit, COALESCE(SUM(jl.credit), 0) AS credit
     FROM journal_lines jl
     JOIN journal_entries je ON je.id = jl.journal_entry_id
     WHERE ${conditions.join(' AND ')}
     GROUP BY je.id, je.date, je.description, je.ref_type, je.ref_no, je.created_at
     ORDER BY je.date ASC, je.created_at ASC`,
    { replacements, transaction, type: QueryTypes.SELECT },
  );

  let running = opening;
  const rows = entries.map((e) => {
    running += naturalBalance(account, e.debit, e.credit);
    return {
      date: e.date,
      description: e.description,
      refType: e.refType,
      refNo: e.refNo,
      debit: e.debit,
      credit: e.credit,
      balance: running,
    };
  });

  const closing = running;
  return { opening, rows, closing };
}

/**
 * Natural balance (paisa) for one `ref` as of a specific instant — everything
 * posted up to and including `at`. Used to snapshot a customer's receivable
 * balance at the moment of a given sale, rather than the live current
 * balance.
 */
async function balanceAsOf(account, ref, at, { store, transaction } = {}) {
  const totals = await accountTotals(account, ref, { to: at, store, transaction });
  return naturalBalance(account, totals.debit, totals.credit);
}

/**
 * Natural balances (paisa) for every `ref` under an account kind, in one
 * query. Used to list all customer receivables / vendor payables at once
 * without a query per party. Returns Map<refIdString, balancePaisa>.
 * Optionally scoped to one store's transactions with each party.
 */
async function balancesByRef(account, { store, transaction } = {}) {
  const conditions = ['jl.account = :account'];
  const replacements = { account };
  if (store) {
    conditions.push('(je.store_id = :store OR je.store_id IS NULL)');
    replacements.store = store;
  }

  const rows = await getPostgres().query(
    `SELECT jl.ref_id AS ref, COALESCE(SUM(jl.debit), 0) AS debit, COALESCE(SUM(jl.credit), 0) AS credit
     FROM journal_lines jl
     JOIN journal_entries je ON je.id = jl.journal_entry_id
     WHERE ${conditions.join(' AND ')}
     GROUP BY jl.ref_id`,
    { replacements, transaction, type: QueryTypes.SELECT },
  );

  const map = new Map();
  for (const r of rows) {
    if (!r.ref) continue;
    map.set(String(r.ref), naturalBalance(account, r.debit, r.credit));
  }
  return map;
}

module.exports = {
  line,
  post,
  accountBalance,
  accountTotals,
  accountStatement,
  balanceAsOf,
  balancesByRef,
};
