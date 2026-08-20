const mongoose = require('mongoose');
const Expense = require('../models/expenseModel');
const ExpenseCategory = require('../models/expenseCategoryModel');
const Store = require('../models/storeModel');
const ApiError = require('../utils/ApiError');
const { toPaisa, view } = require('../utils/money');
const { ACCOUNT, REF } = require('../utils/finance');
const journalService = require('./journalService');
const counterService = require('./counterService');
const { findOrCreateByName } = require('./catalogService');
const { settlementAccount, assertSufficientFunds } = require('./paymentService');
const { parsePagination, escapeRegex } = require('../utils/query');
const { actorStoreId, assertStoreAccess } = require('../utils/storeScope');
const { ROLES } = require('../utils/constants');

/**
 * Day-to-day operating expenses — food, utility bills, office/equipment
 * upkeep, and anything else that isn't a purchase or a sale. Each create/
 * edit/delete keeps a balanced journal entry in step (Dr Operating Expense /
 * Cr Cash|Bank), the same posting paymentService.recordExpense uses, but as
 * a mutable record with a category, so spend can actually be listed, fixed,
 * and reported by category — a bare journal entry can't do any of that.
 */

async function listCategories() {
  return ExpenseCategory.find({ isActive: true }).sort({ name: 1 }).lean();
}

async function createCategory(name, description) {
  if (!name || !String(name).trim()) throw ApiError.badRequest('A name is required');
  return findOrCreateByName(ExpenseCategory, name, { description: (description || '').trim() });
}

async function resolveCategory({ category, categoryName }) {
  if (category) {
    if (!mongoose.isValidObjectId(category)) throw ApiError.badRequest('Invalid category');
    const doc = await ExpenseCategory.findById(category);
    if (!doc) throw ApiError.notFound('Expense category not found');
    return doc;
  }
  if (categoryName && categoryName.trim()) {
    return findOrCreateByName(ExpenseCategory, categoryName);
  }
  throw ApiError.badRequest('A category is required');
}

async function requireStore(actor, store) {
  const restricted = actorStoreId(actor);
  const storeId = restricted || store;
  if (!storeId || !mongoose.isValidObjectId(storeId)) {
    throw ApiError.badRequest('A store is required');
  }
  const storeDoc = await Store.findById(storeId);
  if (!storeDoc) throw ApiError.badRequest('Store not found');
  assertStoreAccess(actor, storeDoc._id);
  return storeDoc;
}

// Dr Operating Expense / Cr Cash|Bank — the ledger effect of an expense
// existing. Shared by create and the repost half of an edit.
async function postExpenseJournal(expense, actor) {
  const settle = await settlementAccount(expense.method, expense.bankAccount);
  await assertSufficientFunds(settle.account, settle.ref, expense.amount);
  const entry = await journalService.post({
    date: expense.date,
    description: expense.note || `${expense.categoryName} expense ${expense.number}`,
    refType: REF.EXPENSE,
    refId: expense._id,
    refNo: expense.number,
    warehouse: expense.warehouse,
    store: expense.store,
    createdBy: actor ? actor._id : null,
    lines: [
      journalService.line(ACCOUNT.OPERATING_EXPENSE, { debit: expense.amount }),
      journalService.line(settle.account, { credit: expense.amount, ref: settle.ref }),
    ],
  });
  expense.journalEntry = entry._id;
}

// The exact reverse of postExpenseJournal, against the expense's *current*
// (pre-edit) method/amount — journal entries are append-only (see
// journalEntryModel.js), so "undo" always means posting the opposite entry,
// never touching the original.
async function reverseExpenseJournal(expense, actor) {
  const settle = await settlementAccount(expense.method, expense.bankAccount);
  await journalService.post({
    date: new Date(),
    description: `Reversal of expense ${expense.number}`,
    refType: REF.EXPENSE,
    refId: expense._id,
    refNo: expense.number,
    warehouse: expense.warehouse,
    store: expense.store,
    createdBy: actor ? actor._id : null,
    lines: [
      journalService.line(settle.account, { debit: expense.amount, ref: settle.ref }),
      journalService.line(ACCOUNT.OPERATING_EXPENSE, { credit: expense.amount }),
    ],
  });
}

async function createExpense(actor, input) {
  const { amount, method, bankAccount, warehouse, date, note } = input;
  const categoryDoc = await resolveCategory(input);
  const storeDoc = await requireStore(actor, input.store);

  const amt = toPaisa(amount);
  if (amt <= 0) throw ApiError.badRequest('Amount must be positive');
  if (!method) throw ApiError.badRequest('A payment method is required');

  const when = date ? new Date(date) : new Date();
  const number = await counterService.nextDocNumber('EXP', when.getFullYear(), 6);

  const expense = new Expense({
    number,
    category: categoryDoc._id,
    categoryName: categoryDoc.name,
    amount: amt,
    method,
    bankAccount: bankAccount || null,
    store: storeDoc._id,
    warehouse: warehouse || null,
    date: when,
    note: (note || '').trim(),
    createdBy: actor ? actor._id : null,
  });

  // A super admin's own entry needs no one else's sign-off; everyone else's
  // stays PENDING — no journal effect — until a super admin approves it (see
  // approveExpense/rejectExpense below).
  if (actor && actor.role === ROLES.SUPER_ADMIN) {
    expense.status = Expense.EXPENSE_STATUS.APPROVED;
    expense.approvedBy = actor._id;
    expense.approvedAt = new Date();
    await postExpenseJournal(expense, actor);
  }

  await expense.save();
  return expense;
}

async function getExpenseById(actor, id) {
  const expense = await Expense.findById(id)
    .populate('category', 'name')
    .populate('store', 'name code');
  if (!expense) throw ApiError.notFound('Expense not found');
  assertStoreAccess(actor, expense.store?._id ?? expense.store);
  return expense;
}

async function updateExpense(actor, id, input) {
  const expense = await Expense.findById(id);
  if (!expense) throw ApiError.notFound('Expense not found');
  assertStoreAccess(actor, expense.store);
  if (expense.status === Expense.EXPENSE_STATUS.REJECTED) {
    throw ApiError.badRequest('A rejected expense cannot be edited');
  }

  const { amount, method, bankAccount, warehouse, date, note } = input;
  const categoryDoc = await resolveCategory(input);

  // A PENDING expense has no journal entry yet, so there is nothing to
  // reverse — only an already-APPROVED one needs the old ledger effect
  // undone before the revised one is posted (never edit the entry itself).
  const wasApproved = expense.status === Expense.EXPENSE_STATUS.APPROVED;
  if (wasApproved) {
    await reverseExpenseJournal(expense, actor);
  }

  const amt = amount !== undefined ? toPaisa(amount) : expense.amount;
  if (amt <= 0) throw ApiError.badRequest('Amount must be positive');

  expense.category = categoryDoc._id;
  expense.categoryName = categoryDoc.name;
  expense.amount = amt;
  expense.method = method || expense.method;
  expense.bankAccount = bankAccount !== undefined ? bankAccount || null : expense.bankAccount;
  expense.warehouse = warehouse !== undefined ? warehouse || null : expense.warehouse;
  expense.date = date ? new Date(date) : expense.date;
  expense.note = note !== undefined ? note.trim() : expense.note;

  if (wasApproved) {
    await postExpenseJournal(expense, actor);
  }
  await expense.save();
  return expense;
}

async function deleteExpense(actor, id) {
  const expense = await Expense.findById(id);
  if (!expense) throw ApiError.notFound('Expense not found');
  assertStoreAccess(actor, expense.store);

  if (expense.status === Expense.EXPENSE_STATUS.APPROVED) {
    await reverseExpenseJournal(expense, actor);
  }
  await expense.deleteOne();
}

// Super-admin-only sign-off — posts the Dr Operating Expense / Cr Cash|Bank
// entry that createExpense skipped for a non-super-admin creator. Also
// covers reversing an earlier reject: a super admin can change their mind
// either direction, so PENDING and REJECTED both post fresh here (REJECTED
// never had a journal entry to begin with, same as PENDING).
async function approveExpense(actor, id) {
  const expense = await Expense.findById(id);
  if (!expense) throw ApiError.notFound('Expense not found');
  assertStoreAccess(actor, expense.store);
  if (expense.status === Expense.EXPENSE_STATUS.APPROVED) {
    throw ApiError.badRequest('Expense is already approved');
  }

  await postExpenseJournal(expense, actor);
  expense.status = Expense.EXPENSE_STATUS.APPROVED;
  expense.approvedBy = actor._id;
  expense.approvedAt = new Date();
  expense.rejectedBy = null;
  expense.rejectedAt = null;
  expense.rejectionReason = '';
  await expense.save();
  return expense;
}

// Rejecting a still-PENDING expense never touched the books — pure status
// change. Rejecting a previously-APPROVED one (the super admin reversing
// their own sign-off) must undo that ledger effect first — a REJECTED
// expense always has no journal effect, regardless of history.
async function rejectExpense(actor, id, reason) {
  const expense = await Expense.findById(id);
  if (!expense) throw ApiError.notFound('Expense not found');
  assertStoreAccess(actor, expense.store);
  if (expense.status === Expense.EXPENSE_STATUS.REJECTED) {
    throw ApiError.badRequest('Expense is already rejected');
  }

  if (expense.status === Expense.EXPENSE_STATUS.APPROVED) {
    await reverseExpenseJournal(expense, actor);
    expense.journalEntry = null;
  }

  expense.status = Expense.EXPENSE_STATUS.REJECTED;
  expense.rejectedBy = actor._id;
  expense.rejectedAt = new Date();
  expense.rejectionReason = (reason || '').trim();
  expense.approvedBy = null;
  expense.approvedAt = null;
  await expense.save();
  return expense;
}

async function listExpenses({ category, store, from, to, search, status, actor, ...query } = {}) {
  const { page, limit, skip } = parsePagination(query);
  const filter = {};

  const restricted = actorStoreId(actor);
  const effectiveStore = restricted || store;
  // Cast to a real ObjectId (not left as a string) — `.aggregate()` below
  // does no schema-based auto-casting the way `.find()` does, so a bare
  // string would silently match nothing in the $match stage.
  if (effectiveStore && mongoose.isValidObjectId(effectiveStore)) {
    filter.store = new mongoose.Types.ObjectId(effectiveStore);
  }

  if (category && mongoose.isValidObjectId(category)) {
    filter.category = new mongoose.Types.ObjectId(category);
  }
  if (status && Object.values(Expense.EXPENSE_STATUS).includes(status)) filter.status = status;
  if (from || to) {
    filter.date = {};
    if (from) filter.date.$gte = new Date(from);
    if (to) filter.date.$lte = new Date(to);
  }
  if (search) {
    const re = new RegExp(escapeRegex(search), 'i');
    filter.$or = [{ number: re }, { categoryName: re }, { note: re }];
  }

  const [expenses, total, totalAmountAgg] = await Promise.all([
    Expense.find(filter)
      .populate('category', 'name')
      .populate('store', 'name code')
      .sort({ date: -1, createdAt: -1 })
      .skip(skip)
      .limit(limit),
    Expense.countDocuments(filter),
    Expense.aggregate([{ $match: filter }, { $group: { _id: null, total: { $sum: '$amount' } } }]),
  ]);

  return { expenses, total, page, limit, totalAmount: totalAmountAgg[0]?.total ?? 0 };
}

// Spend grouped by category over a range — the "what are we actually
// spending on" view.
async function categoryTotals({ store, from, to, actor } = {}) {
  const filter = {};
  const restricted = actorStoreId(actor);
  const effectiveStore = restricted || store;
  if (effectiveStore && mongoose.isValidObjectId(effectiveStore)) {
    filter.store = new mongoose.Types.ObjectId(effectiveStore);
  }
  // Only money that has actually posted counts as "what we're spending" —
  // a still-PENDING expense hasn't touched the books yet.
  filter.status = Expense.EXPENSE_STATUS.APPROVED;
  if (from || to) {
    filter.date = {};
    if (from) filter.date.$gte = new Date(from);
    if (to) filter.date.$lte = new Date(to);
  }

  const rows = await Expense.aggregate([
    { $match: filter },
    {
      $group: {
        _id: '$category',
        categoryName: { $first: '$categoryName' },
        total: { $sum: '$amount' },
      },
    },
    { $sort: { total: -1 } },
  ]);
  return rows.map((r) =>
    view({ categoryId: String(r._id), categoryName: r.categoryName, total: r.total }, ['total']),
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
