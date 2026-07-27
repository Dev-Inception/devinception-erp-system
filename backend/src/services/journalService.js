const { QueryTypes, Op } = require('sequelize');
const { initializeModels } = require('../db/models');
const { getPostgres } = require('../db/postgres');
const ApiError = require('../utils/ApiError');
const { naturalBalance } = require('../utils/finance');
const { JournalEntry, JournalLine } = initializeModels();

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
 * balanced; we re-check here so callers get a clean 400 before PostgreSQL's
 * deferred balance constraint runs, and drop zero/zero lines defensively.
 */
async function post({
  date,
  description = '',
  refType,
  refId = null,
  refNo = '',
  warehouse = null,
  lines,
  createdBy = null,
  transaction: outerTransaction = null,
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

  const write = async (transaction) => {
    const entry = await JournalEntry.create(
      {
        date: date || new Date(),
        description,
        refType,
        refId,
        refNo,
        warehouse,
        createdBy,
      },
      { transaction },
    );
    await JournalLine.bulkCreate(
      clean.map((journalLine, position) => ({
        ...journalLine,
        journalEntryId: entry.id,
        position,
      })),
      { transaction, validate: true },
    );
    return JournalEntry.findByPk(entry.id, {
      include: [{ model: JournalLine, as: 'lines' }],
      transaction,
    });
  };

  if (outerTransaction) return write(outerTransaction);
  return getPostgres().transaction(write);
}

/**
 * Current natural balance (paisa) for an account: positive means the expected
 * direction — cash on hand, a customer's receivable, a vendor's payable, etc.
 */
async function accountBalance(account, ref = null) {
  const totals = await accountTotals(account, ref);
  return naturalBalance(account, totals.debit, totals.credit);
}

// Raw debit/credit totals (paisa) for an account over an optional date range.
async function accountTotals(account, ref = null, { from, to, refType, refIds, warehouse } = {}) {
  const clauses = ['jl.account = :account'];
  const replacements = { account, ref };
  clauses.push(ref ? 'jl.ref_id = :ref' : 'jl.ref_id IS NULL');
  if (from) {
    clauses.push('je.date >= :from');
    replacements.from = from;
  }
  if (to) {
    clauses.push('je.date <= :to');
    replacements.to = to;
  }
  if (refType) {
    clauses.push('je.ref_type = :refType');
    replacements.refType = refType;
  }
  if (warehouse) {
    clauses.push('je.warehouse_id = :warehouse');
    replacements.warehouse = warehouse;
  }
  if (Array.isArray(refIds)) {
    if (!refIds.length) return { debit: 0, credit: 0 };
    clauses.push('je.ref_id IN (:refIds)');
    replacements.refIds = refIds.map(String);
  }

  const [row] = await getPostgres().query(
    `SELECT COALESCE(SUM(jl.debit), 0) AS debit,
            COALESCE(SUM(jl.credit), 0) AS credit
       FROM journal_lines jl
       JOIN journal_entries je ON je.id = jl.journal_entry_id
      WHERE ${clauses.join(' AND ')}`,
    { replacements, type: QueryTypes.SELECT },
  );
  return { debit: Number(row.debit), credit: Number(row.credit) };
}

/**
 * Account statement: opening balance + each entry that touches the account
 * within [from, to], with a running balance. Used for party ledgers and the
 * cash/bank book. Returns paisa; the controller converts to rupees.
 */
async function accountStatement(account, ref = null, { from, to } = {}) {
  // Opening balance = everything strictly before `from`.
  let opening = 0;
  if (from) {
    const before = await accountTotals(account, ref, { to: new Date(from.getTime() - 1) });
    opening = naturalBalance(account, before.debit, before.credit);
  }

  const where = {};
  if (from || to) {
    where.date = {};
    if (from) where.date[Op.gte] = from;
    if (to) where.date[Op.lte] = to;
  }

  const entries = await JournalEntry.findAll({
    where,
    include: [
      {
        model: JournalLine,
        as: 'lines',
        required: true,
        where: {
          account,
          ref: ref || null,
        },
      },
    ],
    order: [
      ['date', 'ASC'],
      ['createdAt', 'ASC'],
    ],
  });

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
 */
async function balancesByRef(account) {
  const rows = await getPostgres().query(
    `SELECT ref_id, SUM(debit) AS debit, SUM(credit) AS credit
       FROM journal_lines
      WHERE account = :account
      GROUP BY ref_id`,
    { replacements: { account }, type: QueryTypes.SELECT },
  );

  const map = new Map();
  for (const r of rows) {
    if (!r.ref_id) continue;
    map.set(String(r.ref_id), naturalBalance(account, Number(r.debit), Number(r.credit)));
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
