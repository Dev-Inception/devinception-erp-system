const express = require('express');
const expenseController = require('../controllers/expenseController');
const { protect } = require('../middlewares/authMiddleware');
const { requirePermission } = require('../middlewares/roleMiddleware');
const { validate } = require('../middlewares/validateMiddleware');
const { PERMISSIONS } = require('../utils/permissions');
const {
  createExpenseValidator,
  updateExpenseValidator,
  createCategoryValidator,
  listExpensesValidator,
  idParamValidator,
  rejectExpenseValidator,
} = require('../validators/expenseValidator');

const router = express.Router();
router.use(protect);

// Must be registered before `/:id` below — otherwise Express would match
// "categories"/"totals" as the :id param and never reach these handlers.
router.get(
  '/categories',
  requirePermission(PERMISSIONS.EXPENSES_MANAGE),
  expenseController.listCategories,
);
router.post(
  '/categories',
  requirePermission(PERMISSIONS.EXPENSES_MANAGE),
  createCategoryValidator,
  validate,
  expenseController.createCategory,
);
router.get(
  '/totals',
  requirePermission(PERMISSIONS.EXPENSES_MANAGE),
  expenseController.getCategoryTotals,
);

router.get(
  '/',
  requirePermission(PERMISSIONS.EXPENSES_MANAGE),
  listExpensesValidator,
  validate,
  expenseController.listExpenses,
);
router.get(
  '/:id',
  requirePermission(PERMISSIONS.EXPENSES_MANAGE),
  idParamValidator,
  validate,
  expenseController.getExpense,
);
router.post(
  '/',
  requirePermission(PERMISSIONS.EXPENSES_MANAGE),
  createExpenseValidator,
  validate,
  expenseController.createExpense,
);
router.patch(
  '/:id',
  requirePermission(PERMISSIONS.EXPENSES_MANAGE),
  updateExpenseValidator,
  validate,
  expenseController.updateExpense,
);
// Sign-off is a separate permission from expenses:manage — a store admin
// may approve/reject only their own store's expenses (see
// expenseService.approveExpense/rejectExpense's assertStoreAccess check).
router.post(
  '/:id/approve',
  requirePermission(PERMISSIONS.EXPENSES_APPROVE),
  idParamValidator,
  validate,
  expenseController.approveExpense,
);
router.post(
  '/:id/reject',
  requirePermission(PERMISSIONS.EXPENSES_APPROVE),
  rejectExpenseValidator,
  validate,
  expenseController.rejectExpense,
);
router.delete(
  '/:id',
  requirePermission(PERMISSIONS.EXPENSES_MANAGE),
  idParamValidator,
  validate,
  expenseController.deleteExpense,
);

module.exports = router;
