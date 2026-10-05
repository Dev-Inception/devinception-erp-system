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

// Invoice # search for a Labour/Transport expense.
const listPayableSales = asyncHandler(async (req, res) => {
  const { kind, store, search } = req.query;
  const sales = await expenseService.listPayableSales({ actor: req.user, kind, store, search });
  return sendSuccess(res, 200, 'Payable sales fetched', { sales });
});

// A labourer's / transporter's payouts — mounted under /labour/:id and
// /transporters/:id (their own read permissions), not /expenses.
const listLabourPayments = asyncHandler(async (req, res) => {
  const payments = await expenseService.listPayeePayments({
    actor: req.user,
    labour: req.params.id,
  });
  return sendSuccess(res, 200, 'Labour payments fetched', { payments });
});
// Labour page → Track: invoice # suggestions, then who worked on the picked
// invoice and what they've been paid for it.
const searchTrackableSales = asyncHandler(async (req, res) => {
  const { store, search } = req.query;
  const sales = await expenseService.searchTrackableSales({ actor: req.user, store, search });
  return sendSuccess(res, 200, 'Invoices fetched', { sales });
});
const trackSaleLabour = asyncHandler(async (req, res) => {
  const result = await expenseService.trackSaleLabour({
    actor: req.user,
    sale: req.params.saleId,
  });
  return sendSuccess(res, 200, 'Invoice labour fetched', result);
});
const listTransporterPayments = asyncHandler(async (req, res) => {
  const payments = await expenseService.listPayeePayments({
    actor: req.user,
    transporter: req.params.id,
  });
  return sendSuccess(res, 200, 'Transporter payments fetched', { payments });
});

module.exports = {
  listPayableSales,
  listLabourPayments,
  listTransporterPayments,
  searchTrackableSales,
  trackSaleLabour,
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
