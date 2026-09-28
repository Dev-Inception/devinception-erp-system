const { body, query, param } = require('express-validator');

const idParam = param('id').isMongoId().withMessage('Invalid damaged stock return id');

const listOutstandingValidator = [
  query('supplier').optional({ values: 'falsy' }).isMongoId().withMessage('Invalid supplier'),
  query('store').optional({ values: 'falsy' }).isMongoId().withMessage('Invalid store'),
  query('warehouse').optional({ values: 'falsy' }).isMongoId().withMessage('Invalid warehouse'),
];

const createReturnValidator = [
  body('supplier').isMongoId().withMessage('A valid supplier is required'),
  body('store').isMongoId().withMessage('A store is required'),
  body('warehouse').isMongoId().withMessage('A valid warehouse is required'),
  body('date').optional({ values: 'falsy' }).isISO8601().withMessage('Invalid date'),
  body('truck.vehicleNumber').optional({ values: 'falsy' }).trim().isLength({ max: 80 }),
  body('truck.driverName').optional({ values: 'falsy' }).trim().isLength({ max: 120 }),
  body('truck.driverPhone').optional({ values: 'falsy' }).trim().isLength({ max: 40 }),
  body('items').isArray({ min: 1 }).withMessage('At least one item is required'),
  body('items.*.stockReceiptItemId')
    .isInt({ min: 1 })
    .withMessage('Each item needs a valid receipt line id'),
  body('items.*.quantity').isFloat({ gt: 0 }).withMessage('Each quantity must be positive'),
  body('note').optional({ values: 'falsy' }).trim().isLength({ max: 500 }),
];

const listReturnsValidator = [
  query('supplier').optional({ values: 'falsy' }).isMongoId().withMessage('Invalid supplier'),
  query('store').optional({ values: 'falsy' }).isMongoId().withMessage('Invalid store'),
  query('warehouse').optional({ values: 'falsy' }).isMongoId().withMessage('Invalid warehouse'),
];

module.exports = {
  listOutstandingValidator,
  createReturnValidator,
  listReturnsValidator,
  idParamValidator: [idParam],
};
