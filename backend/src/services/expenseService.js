const { Op, fn, col } = require('sequelize');
const { initializeModels } = require('../db/models');
const { isValidId } = require('../db/id');
const ApiError = require('../utils/ApiError');
const { toPaisa, view } = require('../utils/money');
const { ACCOUNT, REF } = require('../utils/finance');
const journalService = require('./journalService');
const counterService = require('./counterService');
const { findOrCreateByName } = require('./catalogService');
const { settlementAccount, assertSufficientFunds } = require('./paymentService');
const { parsePagination } = require('../utils/query');
const { actorStoreId, assertStoreAccess } = require('../utils/storeScope');
const { ROLES } = require('../utils/constants');
const { Expense, ExpenseCategory, Store } = initializeModels();
const actorId = (actor) => actor && (actor.id || actor._id);
const STATUS = Expense.EXPENSE_STATUS;
const listCategories = () =>
  ExpenseCategory.findAll({ where: { isActive: true }, order: [['name', 'ASC']] });
async function createCategory(name, description) {
  if (!String(name || '').trim()) throw ApiError.badRequest('A name is required');
  return findOrCreateByName(ExpenseCategory, name, {
    description: String(description || '').trim(),
  });
}
async function resolveCategory({ category, categoryName }) {
  if (category) {
    if (!isValidId(category)) throw ApiError.badRequest('Invalid category');
    const row = await ExpenseCategory.findByPk(category);
    if (!row) throw ApiError.notFound('Expense category not found');
    return row;
  }
  if (categoryName?.trim()) return findOrCreateByName(ExpenseCategory, categoryName);
  throw ApiError.badRequest('A category is required');
}
async function requireStore(actor, requested) {
  const id = actorStoreId(actor) || requested;
  if (!id || !isValidId(String(id))) throw ApiError.badRequest('A store is required');
  const row = await Store.findByPk(id);
  if (!row) throw ApiError.badRequest('Store not found');
  assertStoreAccess(actor, id);
  return row;
}
async function postJournal(expense, actor) {
  const settle = await settlementAccount(expense.method, expense.bankAccount, expense.store);
  await assertSufficientFunds(settle.account, settle.ref, Number(expense.amount), {
    store: expense.store,
  });
  const entry = await journalService.post({
    date: expense.date,
    description: expense.note || `${expense.categoryName} expense ${expense.number}`,
    refType: REF.EXPENSE,
    refId: expense.id,
    refNo: expense.number,
    warehouse: expense.warehouse,
    store: expense.store,
    createdBy: actorId(actor),
    lines: [
      journalService.line(ACCOUNT.OPERATING_EXPENSE, { debit: Number(expense.amount) }),
      journalService.line(settle.account, { credit: Number(expense.amount), ref: settle.ref }),
    ],
  });
  expense.journalEntry = entry.id;
}
async function reverseJournal(expense, actor) {
  const settle = await settlementAccount(expense.method, expense.bankAccount, expense.store);
  await journalService.post({
    date: new Date(),
    description: `Reversal of expense ${expense.number}`,
    refType: REF.EXPENSE,
    refId: expense.id,
    refNo: expense.number,
    warehouse: expense.warehouse,
    store: expense.store,
    createdBy: actorId(actor),
    lines: [
      journalService.line(settle.account, { debit: Number(expense.amount), ref: settle.ref }),
      journalService.line(ACCOUNT.OPERATING_EXPENSE, { credit: Number(expense.amount) }),
    ],
  });
}
async function createExpense(actor, input) {
  const category = await resolveCategory(input);
  const store = await requireStore(actor, input.store);
  const amount = toPaisa(input.amount);
  if (amount <= 0) throw ApiError.badRequest('Amount must be positive');
  if (!input.method) throw ApiError.badRequest('A payment method is required');
  const when = input.date ? new Date(input.date) : new Date();
  const row = Expense.build({
    number: await counterService.nextDocNumber('EXP', when.getFullYear(), 6),
    category: category.id,
    categoryName: category.name,
    amount,
    method: input.method,
    bankAccount: input.bankAccount || null,
    store: store.id,
    warehouse: input.warehouse || null,
    date: when,
    note: String(input.note || '').trim(),
    createdBy: actorId(actor),
  });
  if (actor?.role === ROLES.SUPER_ADMIN) {
    row.status = STATUS.APPROVED;
    row.approvedBy = actorId(actor);
    row.approvedAt = new Date();
    await postJournal(row, actor);
  }
  await row.save();
  return row;
}
async function getExpenseById(actor, id) {
  const row = await Expense.findByPk(id);
  if (!row) throw ApiError.notFound('Expense not found');
  assertStoreAccess(actor, row.store);
  return row;
}
async function updateExpense(actor, id, input) {
  const row = await getExpenseById(actor, id);
  if (row.status === STATUS.REJECTED)
    throw ApiError.badRequest('A rejected expense cannot be edited');
  const approved = row.status === STATUS.APPROVED;
  if (approved) await reverseJournal(row, actor);
  const category = await resolveCategory(input);
  const amount = input.amount === undefined ? Number(row.amount) : toPaisa(input.amount);
  if (amount <= 0) throw ApiError.badRequest('Amount must be positive');
  await row.update({
    category: category.id,
    categoryName: category.name,
    amount,
    method: input.method || row.method,
    bankAccount: input.bankAccount === undefined ? row.bankAccount : input.bankAccount || null,
    warehouse: input.warehouse === undefined ? row.warehouse : input.warehouse || null,
    date: input.date ? new Date(input.date) : row.date,
    note: input.note === undefined ? row.note : input.note.trim(),
  });
  if (approved) {
    await postJournal(row, actor);
    await row.save();
  }
  return row;
}
async function deleteExpense(actor, id) {
  const row = await getExpenseById(actor, id);
  if (row.status === STATUS.APPROVED) await reverseJournal(row, actor);
  await row.destroy();
}
async function approveExpense(actor, id) {
  const row = await getExpenseById(actor, id);
  if (row.status === STATUS.APPROVED) throw ApiError.badRequest('Expense is already approved');
  await postJournal(row, actor);
  return row.update({
    status: STATUS.APPROVED,
    approvedBy: actorId(actor),
    approvedAt: new Date(),
    rejectedBy: null,
    rejectedAt: null,
    rejectionReason: '',
    journalEntry: row.journalEntry,
  });
}
async function rejectExpense(actor, id, reason) {
  const row = await getExpenseById(actor, id);
  if (row.status === STATUS.REJECTED) throw ApiError.badRequest('Expense is already rejected');
  if (row.status === STATUS.APPROVED) await reverseJournal(row, actor);
  return row.update({
    status: STATUS.REJECTED,
    rejectedBy: actorId(actor),
    rejectedAt: new Date(),
    rejectionReason: String(reason || '').trim(),
    approvedBy: null,
    approvedAt: null,
    journalEntry: null,
  });
}
function buildWhere({ category, store, from, to, search, status, actor }) {
  const where = {};
  const scoped = actorStoreId(actor) || store;
  if (scoped && isValidId(String(scoped))) where.store = scoped;
  if (category && isValidId(category)) where.category = category;
  if (status && Object.values(STATUS).includes(status)) where.status = status;
  if (from || to) {
    where.date = {};
    if (from) where.date[Op.gte] = new Date(from);
    if (to) where.date[Op.lte] = new Date(to);
  }
  if (search)
    where[Op.or] = ['number', 'categoryName', 'note'].map((field) => ({
      [field]: { [Op.iLike]: `%${search}%` },
    }));
  return where;
}
async function listExpenses(args = {}) {
  const { page, limit, skip: offset } = parsePagination(args);
  const where = buildWhere(args);
  const [{ rows, count }, total] = await Promise.all([
    Expense.findAndCountAll({
      where,
      order: [
        ['date', 'DESC'],
        ['createdAt', 'DESC'],
      ],
      offset,
      limit,
    }),
    Expense.findOne({
      attributes: [[fn('COALESCE', fn('SUM', col('amount')), 0), 'total']],
      where,
      raw: true,
    }),
  ]);
  return { expenses: rows, total: count, page, limit, totalAmount: Number(total.total) };
}
async function categoryTotals(args = {}) {
  const where = { ...buildWhere(args), status: STATUS.APPROVED };
  const rows = await Expense.findAll({
    attributes: ['category', 'categoryName', [fn('SUM', col('amount')), 'total']],
    where,
    group: ['category', 'categoryName'],
    order: [[fn('SUM', col('amount')), 'DESC']],
    raw: true,
  });
  return rows.map((row) =>
    view({ categoryId: row.category, categoryName: row.categoryName, total: Number(row.total) }, [
      'total',
    ]),
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
