const { Op, QueryTypes, fn, col } = require('sequelize');
const { getPostgres } = require('../db/postgres');
const { initializeModels } = require('../db/models');
const { isValidId } = require('../db/id');
const ApiError = require('../utils/ApiError');
const { toPaisa, view } = require('../utils/money');
const { ACCOUNT, REF } = require('../utils/finance');
const journalService = require('./journalService');
const counterService = require('./counterService');
const { findOrCreateByName } = require('./catalogService');
const { settlementAccount, assertSufficientFunds } = require('./paymentService');
const { parsePagination, escapeLike } = require('../utils/query');
const { actorStoreId, assertStoreAccess } = require('../utils/storeScope');
const { ROLES } = require('../utils/constants');

const EXPENSE_STATUS = { PENDING: 'PENDING', APPROVED: 'APPROVED', REJECTED: 'REJECTED' };

/**
 * Day-to-day operating expenses — food, utility bills, office/equipment
 * upkeep, and anything else that isn't a purchase or a sale. Each create/
 * edit/delete keeps a balanced journal entry in step (Dr Operating Expense /
 * Cr Cash|Bank), the same posting paymentService.recordExpense uses, but as
 * a mutable record with a category, so spend can actually be listed, fixed,
 * and reported by category — a bare journal entry can't do any of that.
 */

async function listCategories() {
  const { ExpenseCategory } = initializeModels();
  return ExpenseCategory.findAll({ where: { isActive: true }, order: [['name', 'ASC']] });
}

async function createCategory(name, description) {
  if (!name || !String(name).trim()) throw ApiError.badRequest('A name is required');
  const { ExpenseCategory } = initializeModels();
  return findOrCreateByName(ExpenseCategory, name, { description: (description || '').trim() });
}

async function resolveCategory({ category, categoryName }) {
  const { ExpenseCategory } = initializeModels();
  if (category) {
    if (!isValidId(category)) throw ApiError.badRequest('Invalid category');
    const doc = await ExpenseCategory.findByPk(category);
    if (!doc) throw ApiError.notFound('Expense category not found');
    return doc;
  }
  if (categoryName && categoryName.trim()) {
    return findOrCreateByName(ExpenseCategory, categoryName);
  }
  throw ApiError.badRequest('A category is required');
}

async function requireStore(actor, store, transaction) {
  const { Store } = initializeModels();
  const restricted = actorStoreId(actor);
  const storeId = restricted || store;
  if (!storeId || !isValidId(storeId)) {
    throw ApiError.badRequest('A store is required');
  }
  const storeDoc = await Store.findByPk(storeId, { transaction });
  if (!storeDoc) throw ApiError.badRequest('Store not found');
  assertStoreAccess(actor, storeDoc.id);
  return storeDoc;
}

// Dr Operating Expense / Cr Cash|Bank — the ledger effect of an expense
// existing. Shared by create and the repost half of an edit.
async function postExpenseJournal(expense, actor, transaction) {
  const settle = await settlementAccount(
    expense.method,
    expense.bankAccount,
    expense.store,
    transaction,
  );
  await assertSufficientFunds(settle.account, settle.ref, expense.amount, transaction);
  const entry = await journalService.post({
    date: expense.date,
    description: expense.note || `${expense.categoryName} expense ${expense.number}`,
    refType: REF.EXPENSE,
    refId: expense.id,
    refNo: expense.number,
    warehouse: expense.warehouse,
    store: expense.store,
    createdBy: actor ? actor.id : null,
    transaction,
    lines: [
      journalService.line(ACCOUNT.OPERATING_EXPENSE, { debit: expense.amount }),
      journalService.line(settle.account, { credit: expense.amount, ref: settle.ref }),
    ],
  });
  expense.journalEntry = entry.id;
}

// The exact reverse of postExpenseJournal, against the expense's *current*
// (pre-edit) method/amount — journal entries are append-only, so "undo"
// always means posting the opposite entry, never touching the original.
async function reverseExpenseJournal(expense, actor, transaction) {
  const settle = await settlementAccount(
    expense.method,
    expense.bankAccount,
    expense.store,
    transaction,
  );
  await journalService.post({
    date: new Date(),
    description: `Reversal of expense ${expense.number}`,
    refType: REF.EXPENSE,
    refId: expense.id,
    refNo: expense.number,
    warehouse: expense.warehouse,
    store: expense.store,
    createdBy: actor ? actor.id : null,
    transaction,
    lines: [
      journalService.line(settle.account, { debit: expense.amount, ref: settle.ref }),
      journalService.line(ACCOUNT.OPERATING_EXPENSE, { credit: expense.amount }),
    ],
  });
}

async function reloadWithAssociations(id, transaction) {
  const { Expense, ExpenseCategory, Store } = initializeModels();
  return Expense.findByPk(id, {
    include: [
      { model: ExpenseCategory, as: 'categoryInfo', attributes: ['id', 'name'] },
      { model: Store, as: 'storeInfo', attributes: ['id', 'name', 'code'] },
    ],
    transaction,
  });
}

async function createExpense(actor, input) {
  const { amount, method, bankAccount, warehouse, date, note } = input;
  // Catalog resolution isn't part of the financial atomicity story (it's
  // idempotent, shared reference data), so it happens before the transaction,
  // same as the original Mongo flow.
  const categoryDoc = await resolveCategory(input);

  return getPostgres().transaction(async (transaction) => {
    const { Expense } = initializeModels();
    const storeDoc = await requireStore(actor, input.store, transaction);

    const amt = toPaisa(amount);
    if (amt <= 0) throw ApiError.badRequest('Amount must be positive');
    if (!method) throw ApiError.badRequest('A payment method is required');

    const when = date ? new Date(date) : new Date();
    const number = await counterService.nextDocNumber('EXP', when.getFullYear(), 6, transaction);

    const expense = Expense.build({
      number,
      category: categoryDoc.id,
      categoryName: categoryDoc.name,
      amount: amt,
      method,
      bankAccount: bankAccount || null,
      store: storeDoc.id,
      warehouse: warehouse || null,
      date: when,
      note: (note || '').trim(),
      createdBy: actor ? actor.id : null,
    });

    // A super admin's own entry needs no one else's sign-off; everyone
    // else's stays PENDING — no journal effect — until a super admin
    // approves it (see approveExpense/rejectExpense below).
    if (actor && actor.role === ROLES.SUPER_ADMIN) {
      expense.status = EXPENSE_STATUS.APPROVED;
      expense.approvedBy = actor.id;
      expense.approvedAt = new Date();
      await expense.save({ transaction });
      await postExpenseJournal(expense, actor, transaction);
    }

    await expense.save({ transaction });
    return reloadWithAssociations(expense.id, transaction);
  });
}

async function getExpenseById(actor, id) {
  const expense = await reloadWithAssociations(id);
  if (!expense) throw ApiError.notFound('Expense not found');
  assertStoreAccess(actor, expense.store);
  return expense;
}

async function updateExpense(actor, id, input) {
  return getPostgres().transaction(async (transaction) => {
    const { Expense } = initializeModels();
    const expense = await Expense.findByPk(id, { transaction, lock: transaction.LOCK.UPDATE });
    if (!expense) throw ApiError.notFound('Expense not found');
    assertStoreAccess(actor, expense.store);
    if (expense.status === EXPENSE_STATUS.REJECTED) {
      throw ApiError.badRequest('A rejected expense cannot be edited');
    }

    const { amount, method, bankAccount, warehouse, date, note } = input;
    const categoryDoc = await resolveCategory(input);

    // A PENDING expense has no journal entry yet, so there is nothing to
    // reverse — only an already-APPROVED one needs the old ledger effect
    // undone before the revised one is posted (never edit the entry itself).
    const wasApproved = expense.status === EXPENSE_STATUS.APPROVED;
    if (wasApproved) {
      await reverseExpenseJournal(expense, actor, transaction);
    }

    const amt = amount !== undefined ? toPaisa(amount) : expense.amount;
    if (amt <= 0) throw ApiError.badRequest('Amount must be positive');

    expense.category = categoryDoc.id;
    expense.categoryName = categoryDoc.name;
    expense.amount = amt;
    expense.method = method || expense.method;
    expense.bankAccount = bankAccount !== undefined ? bankAccount || null : expense.bankAccount;
    expense.warehouse = warehouse !== undefined ? warehouse || null : expense.warehouse;
    expense.date = date ? new Date(date) : expense.date;
    expense.note = note !== undefined ? note.trim() : expense.note;

    if (wasApproved) {
      await postExpenseJournal(expense, actor, transaction);
    }
    await expense.save({ transaction });
    return reloadWithAssociations(expense.id, transaction);
  });
}

async function deleteExpense(actor, id) {
  return getPostgres().transaction(async (transaction) => {
    const { Expense } = initializeModels();
    const expense = await Expense.findByPk(id, { transaction, lock: transaction.LOCK.UPDATE });
    if (!expense) throw ApiError.notFound('Expense not found');
    assertStoreAccess(actor, expense.store);

    if (expense.status === EXPENSE_STATUS.APPROVED) {
      await reverseExpenseJournal(expense, actor, transaction);
    }
    await expense.destroy({ transaction });
  });
}

// Super-admin-only sign-off — posts the Dr Operating Expense / Cr Cash|Bank
// entry that createExpense skipped for a non-super-admin creator. Also
// covers reversing an earlier reject: a super admin can change their mind
// either direction, so PENDING and REJECTED both post fresh here (REJECTED
// never had a journal entry to begin with, same as PENDING).
async function approveExpense(actor, id) {
  return getPostgres().transaction(async (transaction) => {
    const { Expense } = initializeModels();
    const expense = await Expense.findByPk(id, { transaction, lock: transaction.LOCK.UPDATE });
    if (!expense) throw ApiError.notFound('Expense not found');
    assertStoreAccess(actor, expense.store);
    if (expense.status === EXPENSE_STATUS.APPROVED) {
      throw ApiError.badRequest('Expense is already approved');
    }

    await postExpenseJournal(expense, actor, transaction);
    expense.status = EXPENSE_STATUS.APPROVED;
    expense.approvedBy = actor.id;
    expense.approvedAt = new Date();
    expense.rejectedBy = null;
    expense.rejectedAt = null;
    expense.rejectionReason = '';
    await expense.save({ transaction });
    return reloadWithAssociations(expense.id, transaction);
  });
}

// Rejecting a still-PENDING expense never touched the books — pure status
// change. Rejecting a previously-APPROVED one (the super admin reversing
// their own sign-off) must undo that ledger effect first — a REJECTED
// expense always has no journal effect, regardless of history.
async function rejectExpense(actor, id, reason) {
  return getPostgres().transaction(async (transaction) => {
    const { Expense } = initializeModels();
    const expense = await Expense.findByPk(id, { transaction, lock: transaction.LOCK.UPDATE });
    if (!expense) throw ApiError.notFound('Expense not found');
    assertStoreAccess(actor, expense.store);
    if (expense.status === EXPENSE_STATUS.REJECTED) {
      throw ApiError.badRequest('Expense is already rejected');
    }

    if (expense.status === EXPENSE_STATUS.APPROVED) {
      await reverseExpenseJournal(expense, actor, transaction);
      expense.journalEntry = null;
    }

    expense.status = EXPENSE_STATUS.REJECTED;
    expense.rejectedBy = actor.id;
    expense.rejectedAt = new Date();
    expense.rejectionReason = (reason || '').trim();
    expense.approvedBy = null;
    expense.approvedAt = null;
    await expense.save({ transaction });
    return reloadWithAssociations(expense.id, transaction);
  });
}

async function listExpenses({ category, store, from, to, search, status, actor, ...query } = {}) {
  const { Expense, ExpenseCategory, Store } = initializeModels();
  const { page, limit, skip } = parsePagination(query);
  const where = {};

  const restricted = actorStoreId(actor);
  const effectiveStore = restricted || store;
  if (effectiveStore && isValidId(effectiveStore)) where.store = effectiveStore;
  if (category && isValidId(category)) where.category = category;
  if (status && Object.values(EXPENSE_STATUS).includes(status)) where.status = status;
  if (from || to) {
    where.date = {};
    if (from) where.date[Op.gte] = new Date(from);
    if (to) where.date[Op.lte] = new Date(to);
  }
  if (search) {
    const term = `%${escapeLike(search)}%`;
    where[Op.or] = [
      { number: { [Op.iLike]: term } },
      { categoryName: { [Op.iLike]: term } },
      { note: { [Op.iLike]: term } },
    ];
  }

  const [{ rows, count }, [totalRow]] = await Promise.all([
    Expense.findAndCountAll({
      where,
      include: [
        { model: ExpenseCategory, as: 'categoryInfo', attributes: ['id', 'name'] },
        { model: Store, as: 'storeInfo', attributes: ['id', 'name', 'code'] },
      ],
      order: [
        ['date', 'DESC'],
        ['createdAt', 'DESC'],
      ],
      offset: skip,
      limit,
    }),
    Expense.findAll({
      where,
      attributes: [[fn('COALESCE', fn('SUM', col('amount')), 0), 'total']],
      raw: true,
    }),
  ]);

  return { expenses: rows, total: count, page, limit, totalAmount: totalRow ? totalRow.total : 0 };
}

// Spend grouped by category over a range — the "what are we actually
// spending on" view.
async function categoryTotals({ store, from, to, actor } = {}) {
  const conditions = [`status = 'APPROVED'`];
  const replacements = {};
  const restricted = actorStoreId(actor);
  const effectiveStore = restricted || store;
  if (effectiveStore && isValidId(effectiveStore)) {
    conditions.push('store_id = :store');
    replacements.store = effectiveStore;
  }
  // Only money that has actually posted counts as "what we're spending" —
  // a still-PENDING expense hasn't touched the books yet.
  if (from) {
    conditions.push('date >= :from');
    replacements.from = new Date(from);
  }
  if (to) {
    conditions.push('date <= :to');
    replacements.to = new Date(to);
  }

  const rows = await getPostgres().query(
    `SELECT category_id AS "categoryId", MIN(category_name) AS "categoryName", SUM(amount) AS total
     FROM expenses
     WHERE ${conditions.join(' AND ')}
     GROUP BY category_id
     ORDER BY total DESC`,
    { replacements, type: QueryTypes.SELECT },
  );
  return rows.map((r) =>
    view({ categoryId: r.categoryId, categoryName: r.categoryName, total: r.total }, ['total']),
  );
}

module.exports = {
  listCategories,
  createCategory,
  createExpense,
  getExpenseById,
  updateExpense,
  deleteExpense,
  approveExpense,
  rejectExpense,
  listExpenses,
  categoryTotals,
};
