const { body, param } = require('express-validator');
const { PAYMENT_METHODS } = require('../utils/finance');

const idParam = param('id').isMongoId().withMessage('Invalid invoice id');

const createInvoiceValidator = [
  body('purchaseId').isMongoId().withMessage('A valid goods purchase is required'),
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
