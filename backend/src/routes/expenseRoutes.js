const express = require('express');
const expenseController = require('../controllers/expenseController');
const { protect } = require('../middlewares/authMiddleware');
const { requirePermission, authorize } = require('../middlewares/roleMiddleware');
const { validate } = require('../middlewares/validateMiddleware');
const { PERMISSIONS } = require('../utils/permissions');
const { ROLES } = require('../utils/constants');
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
  requirePermission(PERMISSIONS.FINANCE_READ),
  expenseController.listCategories,
);
router.post(
  '/categories',
  requirePermission(PERMISSIONS.FINANCE_MANAGE),
  createCategoryValidator,
  validate,
  expenseController.createCategory,
);
router.get(
  '/totals',
  requirePermission(PERMISSIONS.FINANCE_READ),
  expenseController.getCategoryTotals,
);

router.get(
  '/',
  requirePermission(PERMISSIONS.FINANCE_READ),
  listExpensesValidator,
  validate,
  expenseController.listExpenses,
);
router.get(
  '/:id',
  requirePermission(PERMISSIONS.FINANCE_READ),
  idParamValidator,
  validate,
  expenseController.getExpense,
);
router.post(
  '/',
  requirePermission(PERMISSIONS.FINANCE_MANAGE),
  createExpenseValidator,
  validate,
  expenseController.createExpense,
);
router.patch(
  '/:id',
  requirePermission(PERMISSIONS.FINANCE_MANAGE),
  updateExpenseValidator,
  validate,
  expenseController.updateExpense,
);
// Sign-off is a super-admin-only action, regardless of who else holds
// finance:manage — see expenseService.approveExpense/rejectExpense.
router.post(
  '/:id/approve',
  authorize(ROLES.SUPER_ADMIN),
  idParamValidator,
  validate,
  expenseController.approveExpense,
);
router.post(
  '/:id/reject',
  authorize(ROLES.SUPER_ADMIN),
  rejectExpenseValidator,
  validate,
  expenseController.rejectExpense,
);
router.delete(
  '/:id',
  requirePermission(PERMISSIONS.FINANCE_MANAGE),
  idParamValidator,
  validate,
  expenseController.deleteExpense,
);

module.exports = router;
