const expenseService = require('../services/expenseService');
const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/ApiResponse');
const { view } = require('../utils/money');

const out = (e) => (e && e.toJSON ? e.toJSON() : e);
function serialize(expense) {
  return view(out(expense), ['amount']);
}

const listCategories = asyncHandler(async (_req, res) => {
  const categories = await expenseService.listCategories();
  return sendSuccess(res, 200, 'Expense categories fetched', { categories });
});

const createCategory = asyncHandler(async (req, res) => {
  const category = await expenseService.createCategory(req.body.name, req.body.description);
  return sendSuccess(res, 201, 'Expense category created', { category });
});

const createExpense = asyncHandler(async (req, res) => {
  const expense = await expenseService.createExpense(req.user, req.body);
  return sendSuccess(res, 201, 'Expense recorded', { expense: serialize(expense) });
});

const getExpense = asyncHandler(async (req, res) => {
  const expense = await expenseService.getExpenseById(req.user, req.params.id);
  return sendSuccess(res, 200, 'Expense fetched', { expense: serialize(expense) });
});

const updateExpense = asyncHandler(async (req, res) => {
  const expense = await expenseService.updateExpense(req.user, req.params.id, req.body);
  return sendSuccess(res, 200, 'Expense updated', { expense: serialize(expense) });
});

const deleteExpense = asyncHandler(async (req, res) => {
  await expenseService.deleteExpense(req.user, req.params.id);
  return sendSuccess(res, 200, 'Expense deleted');
});

const approveExpense = asyncHandler(async (req, res) => {
  const expense = await expenseService.approveExpense(req.user, req.params.id);
  return sendSuccess(res, 200, 'Expense approved', { expense: serialize(expense) });
});

const rejectExpense = asyncHandler(async (req, res) => {
  const expense = await expenseService.rejectExpense(req.user, req.params.id, req.body.reason);
  return sendSuccess(res, 200, 'Expense rejected', { expense: serialize(expense) });
});

const listExpenses = asyncHandler(async (req, res) => {
  const { page, limit, category, store, from, to, search, status } = req.query;
  const result = await expenseService.listExpenses({
    page,
    limit,
    category,
    store,
    from,
    to,
    search,
    status,
    actor: req.user,
  });
  return sendSuccess(res, 200, 'Expenses fetched', {
    ...result,
    expenses: result.expenses.map(serialize),
    totalAmount: view({ totalAmount: result.totalAmount }, ['totalAmount']).totalAmount,
  });
});

const getCategoryTotals = asyncHandler(async (req, res) => {
  const { store, from, to } = req.query;
  const totals = await expenseService.categoryTotals({ store, from, to, actor: req.user });
  return sendSuccess(res, 200, 'Expense totals fetched', { categories: totals });
});

module.exports = {
  listCategories,
  createCategory,
  createExpense,
  getExpense,
  updateExpense,
  deleteExpense,
  approveExpense,
  rejectExpense,
  listExpenses,
  getCategoryTotals,
};
