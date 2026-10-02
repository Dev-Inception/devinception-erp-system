const { body, param, query } = require('express-validator');
const { EXPENSE_METHODS } = require('../db/models/expenseModel');

const idParam = param('id').isMongoId().withMessage('Invalid expense id');

const expenseFieldsValidator = [
  body('category').optional({ values: 'falsy' }).isMongoId().withMessage('Invalid category'),
  body('categoryName')
    .if(body('category').not().exists({ values: 'falsy' }))
    .trim()
    .notEmpty()
    .withMessage('A category is required')
    .isLength({ max: 80 }),
  body('amount').isFloat({ gt: 0 }).withMessage('Amount must be positive'),
  body('method').isIn(EXPENSE_METHODS).withMessage('Invalid payment method'),
  body('bankAccount').optional({ values: 'falsy' }).isMongoId().withMessage('Invalid bank account'),
  body('warehouse').optional({ values: 'falsy' }).isMongoId().withMessage('Invalid warehouse'),
  body('date').optional({ values: 'falsy' }).isISO8601().withMessage('Invalid date'),
  body('note').optional({ values: 'falsy' }).trim().isLength({ max: 500 }),
  // Labour/Transport payouts only (the service enforces which is required).
  body('sale').optional({ values: 'falsy' }).isMongoId().withMessage('Invalid invoice'),
  body('labour').optional({ values: 'falsy' }).isMongoId().withMessage('Invalid labourer'),
  body('transporter').optional({ values: 'falsy' }).isMongoId().withMessage('Invalid transporter'),
];

const createExpenseValidator = [
  body('store').optional({ values: 'falsy' }).isMongoId().withMessage('Invalid store'),
  ...expenseFieldsValidator,
];

const updateExpenseValidator = [idParam, ...expenseFieldsValidator];

const createCategoryValidator = [
  body('name').trim().notEmpty().withMessage('A name is required').isLength({ max: 80 }),
  body('description').optional({ values: 'falsy' }).trim().isLength({ max: 500 }),
];

const listExpensesValidator = [
  query('category').optional({ values: 'falsy' }).isMongoId().withMessage('Invalid category'),
  query('store').optional({ values: 'falsy' }).isMongoId().withMessage('Invalid store'),
  query('from').optional({ values: 'falsy' }).isISO8601().withMessage('Invalid from date'),
  query('to').optional({ values: 'falsy' }).isISO8601().withMessage('Invalid to date'),
];

const idParamValidator = [idParam];

const payableSalesValidator = [
  query('kind').isIn(['LABOUR', 'TRANSPORT']).withMessage('Invalid payout kind'),
  query('store').optional({ values: 'falsy' }).isMongoId().withMessage('Invalid store'),
  query('search').optional({ values: 'falsy' }).trim().isLength({ max: 40 }),
];

const rejectExpenseValidator = [
  idParam,
  body('reason').optional({ values: 'falsy' }).trim().isLength({ max: 500 }),
];

module.exports = {
  createExpenseValidator,
  updateExpenseValidator,
  createCategoryValidator,
  listExpensesValidator,
  idParamValidator,
  rejectExpenseValidator,
  payableSalesValidator,
};
