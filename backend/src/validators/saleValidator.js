const { body, param } = require('express-validator');
const { PAYMENT_METHODS, PAYMENT_METHOD } = require('../utils/finance');

const idParam = param('id')
  .matches(/^[a-f\d]{24}$/i)
  .withMessage('Invalid sale id');

// A later payment against a sale settles it in cash or into a bank/online
// account — it can't itself be "on account" (CREDIT) or a checkout-time
// cash+bank split (MIXED); those only make sense at initial checkout.
const RECEIVABLE_METHODS = [
  PAYMENT_METHOD.CASH,
  PAYMENT_METHOD.CARD,
  PAYMENT_METHOD.BANK_TRANSFER,
  PAYMENT_METHOD.ONLINE,
];

// Items/labour/discount/tax/transport — shared by create (fresh checkout)
// and update (full invoice edit); only the payment fields differ.
const itemsAndTermsValidator = [
  body('warehouse')
    .optional({ values: 'falsy' })
    .matches(/^[a-f\d]{24}$/i)
    .withMessage('Invalid warehouse'),
  body('items').isArray({ min: 1 }).withMessage('At least one item is required'),
  body('items.*.product')
    .matches(/^[a-f\d]{24}$/i)
    .withMessage('Each item needs a valid product'),
  body('items.*.quantity').isFloat({ gt: 0 }).withMessage('Each item quantity must be positive'),
  body('items.*.unitPrice')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Unit price must be non-negative'),
  body('items.*.source')
    .optional({ values: 'falsy' })
    .isIn(['WAREHOUSE', 'VENDOR'])
    .withMessage('Invalid item source'),
  body('items.*.vendor')
    .optional({ values: 'falsy' })
    .matches(/^[a-f\d]{24}$/i)
    .withMessage('Invalid vendor'),
  body('items.*.warehouse')
    .optional({ values: 'falsy' })
    .matches(/^[a-f\d]{24}$/i)
    .withMessage('Invalid item warehouse'),
  body('labour').optional({ values: 'falsy' }).isArray().withMessage('Labour must be an array'),
  body('labour.*.labour')
    .matches(/^[a-f\d]{24}$/i)
    .withMessage('Each labour entry must be a valid labour id'),
  body('labour.*.rent')
    .optional({ values: 'falsy' })
    .isFloat({ min: 0 })
    .withMessage('Labour rent must be non-negative'),
  body('discount')
    .optional({ values: 'falsy' })
    .isFloat({ min: 0 })
    .withMessage('Discount must be non-negative'),
  body('taxPercent')
    .optional({ values: 'falsy' })
    .isFloat({ min: 0, max: 100 })
    .withMessage('Tax % must be 0–100'),
  body('transportFare')
    .optional({ values: 'falsy' })
    .isFloat({ min: 0 })
    .withMessage('Transport fare must be non-negative'),
  body('transport.driverName')
    .optional({ values: 'falsy' })
    .isString()
    .trim()
    .isLength({ max: 120 }),
  body('transport.driverPhone')
    .optional({ values: 'falsy' })
    .isString()
    .trim()
    .isLength({ max: 40 }),
  body('transport.vehicleNumber')
    .optional({ values: 'falsy' })
    .isString()
    .trim()
    .isLength({ max: 80 }),
  // A registered Transporter is optional — when set, the transport fare can
  // post against their ledger (see saleService); omitting a method just
  // means the fare is owed to them rather than settled now.
  body('transporter')
    .optional({ values: 'falsy' })
    .matches(/^[a-f\d]{24}$/i)
    .withMessage('Invalid transporter'),
  body('transportFareMethod')
    .optional({ values: 'falsy' })
    .isIn(RECEIVABLE_METHODS)
    .withMessage('Invalid transport fare payment method'),
  body('transportFareBankAccount')
    .optional({ values: 'falsy' })
    .matches(/^[a-f\d]{24}$/i)
    .withMessage('Invalid bank account'),
];

const createSaleValidator = [
  body('store')
    .matches(/^[a-f\d]{24}$/i)
    .withMessage('A store is required'),
  body('customer')
    .optional({ values: 'falsy' })
    .matches(/^[a-f\d]{24}$/i)
    .withMessage('Invalid customer'),
  body('date').optional({ values: 'falsy' }).isISO8601().withMessage('Invalid date'),
  // Set when this sale is converting an existing estimate — see
  // saleService.createSale, which marks that estimate CONVERTED afterward.
  body('estimate')
    .optional({ values: 'falsy' })
    .matches(/^[a-f\d]{24}$/i)
    .withMessage('Invalid estimate'),
  ...itemsAndTermsValidator,
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
    .matches(/^[a-f\d]{24}$/i)
    .withMessage('Invalid bank account'),
  body('payment.receiptRef')
    .optional({ values: 'falsy' })
    .isString()
    .trim()
    .isLength({ max: 500 })
    .withMessage('Invalid transfer receipt reference'),
];

const updateSaleValidator = [idParam, ...itemsAndTermsValidator];

const recordPaymentValidator = [
  idParam,
  body('amount').isFloat({ gt: 0 }).withMessage('Amount must be positive'),
  body('method').isIn(RECEIVABLE_METHODS).withMessage('Invalid payment method'),
  body('bankAccount')
    .optional({ values: 'falsy' })
    .matches(/^[a-f\d]{24}$/i)
    .withMessage('Invalid bank account'),
  body('note').optional({ values: 'falsy' }).isString().trim().isLength({ max: 500 }),
];

const idParamValidator = [idParam];

module.exports = {
  createSaleValidator,
  updateSaleValidator,
  recordPaymentValidator,
  idParamValidator,
};
