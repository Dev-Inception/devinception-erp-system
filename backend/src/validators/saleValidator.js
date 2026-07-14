const { body, param } = require('express-validator');
const { PAYMENT_METHODS } = require('../utils/finance');

const idParam = param('id').isMongoId().withMessage('Invalid sale id');

const createSaleValidator = [
  body('customer').optional({ values: 'falsy' }).isMongoId().withMessage('Invalid customer'),
  body('warehouse').optional({ values: 'falsy' }).isMongoId().withMessage('Invalid warehouse'),
  body('date').optional({ values: 'falsy' }).isISO8601().withMessage('Invalid date'),
  body('items').isArray({ min: 1 }).withMessage('At least one item is required'),
  body('items.*.product').isMongoId().withMessage('Each item needs a valid product'),
  body('items.*.quantity').isFloat({ gt: 0 }).withMessage('Each item quantity must be positive'),
  body('items.*.unitPrice')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Unit price must be non-negative'),
  body('discount')
    .optional({ values: 'falsy' })
    .isFloat({ min: 0 })
    .withMessage('Discount must be non-negative'),
  body('taxPercent')
    .optional({ values: 'falsy' })
    .isFloat({ min: 0, max: 100 })
    .withMessage('Tax % must be 0–100'),
  body('payment.method').isIn(PAYMENT_METHODS).withMessage('A valid payment method is required'),
  body('payment.cash')
    .optional({ values: 'falsy' })
    .isFloat({ min: 0 })
    .withMessage('Cash must be non-negative'),
  body('payment.online')
    .optional({ values: 'falsy' })
    .isFloat({ min: 0 })
    .withMessage('Online must be non-negative'),
  body('payment.bankAccount')
    .optional({ values: 'falsy' })
    .isMongoId()
    .withMessage('Invalid bank account'),
  body('payment.receiptRef')
    .optional({ values: 'falsy' })
    .isString()
    .trim()
    .isLength({ max: 500 })
    .withMessage('Invalid transfer receipt reference'),
];

const idParamValidator = [idParam];

module.exports = { createSaleValidator, idParamValidator };
