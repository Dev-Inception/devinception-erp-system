const { body, param } = require('express-validator');
const { PAYMENT_METHODS } = require('../utils/finance');

const idParam = param('id').isMongoId().withMessage('Invalid invoice id');

// A sale-derived invoice carries only `{ saleId }`; the customer/items checks
// apply only when no saleId is supplied (the stand-alone-invoice path).
const noSale = (_value, { req }) => !req.body.saleId;

const createInvoiceValidator = [
  body('saleId').optional({ values: 'falsy' }).isMongoId().withMessage('Invalid sale id'),
  body('customer').if(noSale).isMongoId().withMessage('A valid customer is required'),
  body('warehouse').optional({ values: 'falsy' }).isMongoId().withMessage('Invalid warehouse'),
  body('date').optional({ values: 'falsy' }).isISO8601().withMessage('Invalid date'),
  body('dueDate').optional({ values: 'falsy' }).isISO8601().withMessage('Invalid due date'),
  body('items').if(noSale).isArray({ min: 1 }).withMessage('At least one item is required'),
  body('items.*.product').if(noSale).isMongoId().withMessage('Each item needs a valid product'),
  body('items.*.quantity')
    .if(noSale)
    .isFloat({ gt: 0 })
    .withMessage('Each item quantity must be positive'),
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
  body('notes').optional({ values: 'falsy' }).trim().isLength({ max: 1000 }),
];

const payInvoiceValidator = [
  idParam,
  body('amount').isFloat({ gt: 0 }).withMessage('Amount must be positive'),
  body('method')
    .optional({ values: 'falsy' })
    .isIn(PAYMENT_METHODS)
    .withMessage('Invalid payment method'),
  body('bankAccount').optional({ values: 'falsy' }).isMongoId().withMessage('Invalid bank account'),
  body('date').optional({ values: 'falsy' }).isISO8601().withMessage('Invalid date'),
];

const idParamValidator = [idParam];

module.exports = { createInvoiceValidator, payInvoiceValidator, idParamValidator };
