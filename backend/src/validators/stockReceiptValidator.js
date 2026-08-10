const { body, query, param } = require('express-validator');

const idParam = param('id').isMongoId().withMessage('Invalid stock receipt id');

// Shared by create and update — `store` is deliberately excluded here: it's
// required on create only (updateReceipt never changes which storefront a
// delivery was received for).
const receiptFieldsValidator = [
  body('vendor').isMongoId().withMessage('A valid vendor is required'),
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
];

const createReceiptValidator = [
  body('store').isMongoId().withMessage('A store is required'),
  ...receiptFieldsValidator,
];

const updateReceiptValidator = [idParam, ...receiptFieldsValidator];

const idParamValidator = [idParam];

const listReceiptsValidator = [
  query('vendor').optional({ values: 'falsy' }).isMongoId().withMessage('Invalid vendor'),
  query('warehouse').optional({ values: 'falsy' }).isMongoId().withMessage('Invalid warehouse'),
  query('store').optional({ values: 'falsy' }).isMongoId().withMessage('Invalid store'),
];

module.exports = {
  createReceiptValidator,
  updateReceiptValidator,
  idParamValidator,
  listReceiptsValidator,
};
