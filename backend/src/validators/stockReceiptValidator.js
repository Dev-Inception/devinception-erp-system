const { body, query, param } = require('express-validator');
const { PAYMENT_METHOD } = require('../utils/finance');

const idParam = param('id').isMongoId().withMessage('Invalid stock receipt id');

// A payment to the supplier settles in cash or into a bank/online account —
// it can't be CREDIT or MIXED (those only make sense at a POS checkout).
const PAYOUT_METHODS = [
  PAYMENT_METHOD.CASH,
  PAYMENT_METHOD.CARD,
  PAYMENT_METHOD.BANK_TRANSFER,
  PAYMENT_METHOD.ONLINE,
];

// Shared by create and update — `store` is deliberately excluded here: it's
// required on create only (updateReceipt never changes which storefront a
// delivery was received for).
const receiptFieldsValidator = [
  body('supplier').isMongoId().withMessage('A valid supplier is required'),
  body('warehouse').isMongoId().withMessage('A valid warehouse is required'),
  body('date').optional({ values: 'falsy' }).isISO8601().withMessage('Invalid date'),
  body('truck.vehicleNumber')
    .trim()
    .notEmpty()
    .withMessage('Vehicle number is required')
    .isLength({ max: 80 }),
  body('truck.driverName').optional({ values: 'falsy' }).trim().isLength({ max: 120 }),
  body('truck.driverPhone').optional({ values: 'falsy' }).trim().isLength({ max: 40 }),
  body('items').isArray({ min: 1 }).withMessage('At least one product line is required'),
  body('items.*.product').isMongoId().withMessage('Each line needs a valid product'),
  body('items.*.receivedQuantity')
    .optional({ values: 'falsy' })
    .isFloat({ min: 0 })
    .withMessage('Received quantity must be non-negative'),
  body('items.*.damagedQuantity')
    .optional({ values: 'falsy' })
    .isFloat({ min: 0 })
    .withMessage('Damaged quantity must be non-negative'),
  body('note').optional({ values: 'falsy' }).trim().isLength({ max: 500 }),
  body('truckFare')
    .optional({ values: 'falsy' })
    .isFloat({ min: 0 })
    .withMessage('Truck fare must be non-negative'),
  body('truckFarePaidBy')
    .optional({ values: 'falsy' })
    .isIn(['SUPPLIER', 'US'])
    .withMessage('Truck fare must be paid by either the supplier or us'),
  body('truckFareMethod')
    .optional({ values: 'falsy' })
    .isIn(PAYOUT_METHODS)
    .withMessage('Invalid truck fare payment method'),
  // We need a way to pay when we're covering the fare — required whenever
  // there's a positive fare and we're the one paying it, unless a
  // transporter is attached (then omitting it just means the fare is owed
  // to them instead of settled now — see stockReceiptService).
  body('truckFareMethod').custom((value, { req }) => {
    if (
      req.body.truckFarePaidBy === 'US' &&
      Number(req.body.truckFare) > 0 &&
      !value &&
      !req.body.transporter
    ) {
      throw new Error('A payment method is required when we pay the truck fare');
    }
    return true;
  }),
  body('truckFareBankAccount')
    .optional({ values: 'falsy' })
    .isMongoId()
    .withMessage('Invalid bank account'),
  body('transporter').optional({ values: 'falsy' }).isMongoId().withMessage('Invalid transporter'),
  body('labour').optional({ values: 'falsy' }).isArray().withMessage('Labour must be an array'),
  body('labour.*.labour').isMongoId().withMessage('Each labour entry must be a valid labour id'),
  body('labour.*.rent')
    .optional({ values: 'falsy' })
    .isFloat({ min: 0 })
    .withMessage('Labour rent must be non-negative'),
];

const createReceiptValidator = [
  body('store').isMongoId().withMessage('A store is required'),
  ...receiptFieldsValidator,
];

const updateReceiptValidator = [idParam, ...receiptFieldsValidator];

const idParamValidator = [idParam];

const recordPaymentValidator = [
  idParam,
  body('amount').isFloat({ gt: 0 }).withMessage('Amount must be positive'),
  body('method').isIn(PAYOUT_METHODS).withMessage('Invalid payment method'),
  body('bankAccount').optional({ values: 'falsy' }).isMongoId().withMessage('Invalid bank account'),
  body('note').optional({ values: 'falsy' }).isString().trim().isLength({ max: 500 }),
];

const listReceiptsValidator = [
  query('supplier').optional({ values: 'falsy' }).isMongoId().withMessage('Invalid supplier'),
  query('labour').optional({ values: 'falsy' }).isMongoId().withMessage('Invalid labour'),
  query('transporter').optional({ values: 'falsy' }).isMongoId().withMessage('Invalid transporter'),
  query('warehouse').optional({ values: 'falsy' }).isMongoId().withMessage('Invalid warehouse'),
  query('store').optional({ values: 'falsy' }).isMongoId().withMessage('Invalid store'),
];

module.exports = {
  createReceiptValidator,
  updateReceiptValidator,
  idParamValidator,
  listReceiptsValidator,
  recordPaymentValidator,
};
