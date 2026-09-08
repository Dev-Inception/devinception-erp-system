const { body, param } = require('express-validator');
const { PAYMENT_METHODS } = require('../utils/finance');

const idParam = param('id')
  .matches(/^[a-f\d]{24}$/i)
  .withMessage('Invalid id');

/* Bank accounts */
const createBankAccountValidator = [
  body('name').trim().notEmpty().withMessage('Name is required').isLength({ max: 120 }),
  body('bankName').optional({ values: 'falsy' }).trim().isLength({ max: 120 }),
  body('accountNumber').optional({ values: 'falsy' }).trim().isLength({ max: 60 }),
  body('store')
    .matches(/^[a-f\d]{24}$/i)
    .withMessage('A store is required'),
  body('openingBalance')
    .optional({ values: 'falsy' })
    .isFloat({ min: 0 })
    .withMessage('Opening balance must be non-negative'),
];

const updateBankAccountValidator = [
  idParam,
  body('name')
    .optional()
    .trim()
    .notEmpty()
    .withMessage('Name cannot be empty')
    .isLength({ max: 120 }),
  body('bankName').optional({ values: 'falsy' }).trim().isLength({ max: 120 }),
  body('accountNumber').optional({ values: 'falsy' }).trim().isLength({ max: 60 }),
  body('store')
    .optional()
    .matches(/^[a-f\d]{24}$/i)
    .withMessage('Invalid store'),
  body('isActive').optional().isBoolean(),
];

/* Payments */
const payVendorValidator = [
  body('vendor')
    .matches(/^[a-f\d]{24}$/i)
    .withMessage('A valid vendor is required'),
  body('store')
    .matches(/^[a-f\d]{24}$/i)
    .withMessage('A store is required'),
  body('amount').isFloat({ gt: 0 }).withMessage('Amount must be positive'),
  body('method')
    .optional({ values: 'falsy' })
    .isIn(PAYMENT_METHODS)
    .withMessage('Invalid payment method'),
  body('bankAccount')
    .optional({ values: 'falsy' })
    .matches(/^[a-f\d]{24}$/i)
    .withMessage('Invalid bank account'),
  body('date').optional({ values: 'falsy' }).isISO8601().withMessage('Invalid date'),
  body('note').optional({ values: 'falsy' }).trim().isLength({ max: 200 }),
];

const paySupplierValidator = [
  body('supplier')
    .matches(/^[a-f\d]{24}$/i)
    .withMessage('A valid supplier is required'),
  body('store')
    .matches(/^[a-f\d]{24}$/i)
    .withMessage('A store is required'),
  body('amount').isFloat({ gt: 0 }).withMessage('Amount must be positive'),
  body('method')
    .optional({ values: 'falsy' })
    .isIn(PAYMENT_METHODS)
    .withMessage('Invalid payment method'),
  body('bankAccount')
    .optional({ values: 'falsy' })
    .matches(/^[a-f\d]{24}$/i)
    .withMessage('Invalid bank account'),
  body('date').optional({ values: 'falsy' }).isISO8601().withMessage('Invalid date'),
  body('note').optional({ values: 'falsy' }).trim().isLength({ max: 200 }),
];

const payLabourValidator = [
  body('labour')
    .matches(/^[a-f\d]{24}$/i)
    .withMessage('A valid labourer is required'),
  body('store')
    .matches(/^[a-f\d]{24}$/i)
    .withMessage('A store is required'),
  body('amount').isFloat({ gt: 0 }).withMessage('Amount must be positive'),
  body('method')
    .optional({ values: 'falsy' })
    .isIn(PAYMENT_METHODS)
    .withMessage('Invalid payment method'),
  body('bankAccount')
    .optional({ values: 'falsy' })
    .matches(/^[a-f\d]{24}$/i)
    .withMessage('Invalid bank account'),
  body('date').optional({ values: 'falsy' }).isISO8601().withMessage('Invalid date'),
  body('note').optional({ values: 'falsy' }).trim().isLength({ max: 200 }),
];

const payTransportValidator = [
  body('transporter')
    .matches(/^[a-f\d]{24}$/i)
    .withMessage('A valid transporter is required'),
  body('store')
    .matches(/^[a-f\d]{24}$/i)
    .withMessage('A store is required'),
  body('amount').isFloat({ gt: 0 }).withMessage('Amount must be positive'),
  body('method')
    .optional({ values: 'falsy' })
    .isIn(PAYMENT_METHODS)
    .withMessage('Invalid payment method'),
  body('bankAccount')
    .optional({ values: 'falsy' })
    .matches(/^[a-f\d]{24}$/i)
    .withMessage('Invalid bank account'),
  body('date').optional({ values: 'falsy' }).isISO8601().withMessage('Invalid date'),
  body('note').optional({ values: 'falsy' }).trim().isLength({ max: 200 }),
];

const receiveCustomerValidator = [
  body('customer')
    .matches(/^[a-f\d]{24}$/i)
    .withMessage('A valid customer is required'),
  body('store')
    .matches(/^[a-f\d]{24}$/i)
    .withMessage('A store is required'),
  body('amount').isFloat({ gt: 0 }).withMessage('Amount must be positive'),
  body('method')
    .optional({ values: 'falsy' })
    .isIn(PAYMENT_METHODS)
    .withMessage('Invalid payment method'),
  body('bankAccount')
    .optional({ values: 'falsy' })
    .matches(/^[a-f\d]{24}$/i)
    .withMessage('Invalid bank account'),
  body('date').optional({ values: 'falsy' }).isISO8601().withMessage('Invalid date'),
  body('note').optional({ values: 'falsy' }).trim().isLength({ max: 200 }),
];

const cashEntryValidator = [
  body('direction').isIn(['IN', 'OUT']).withMessage('Direction must be IN or OUT'),
  body('store')
    .matches(/^[a-f\d]{24}$/i)
    .withMessage('A store is required'),
  body('amount').isFloat({ gt: 0 }).withMessage('Amount must be positive'),
  body('date').optional({ values: 'falsy' }).isISO8601().withMessage('Invalid date'),
  body('note').optional({ values: 'falsy' }).trim().isLength({ max: 200 }),
];

/* Ledger statement params */
const statementParamValidator = [
  param('kind')
    .isIn(['customer', 'vendor', 'supplier', 'labour', 'transport'])
    .withMessage("kind must be 'customer', 'vendor', 'supplier', 'labour', or 'transport'"),
  param('id')
    .matches(/^[a-f\d]{24}$/i)
    .withMessage('Invalid party id'),
];

const idParamValidator = [idParam];

module.exports = {
  createBankAccountValidator,
  updateBankAccountValidator,
  payVendorValidator,
  paySupplierValidator,
  payLabourValidator,
  payTransportValidator,
  receiveCustomerValidator,
  cashEntryValidator,
  statementParamValidator,
  idParamValidator,
};
