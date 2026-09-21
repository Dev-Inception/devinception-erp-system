const { body, query, param } = require('express-validator');

const idParam = param('id').isMongoId().withMessage('Invalid vendor sale id');

const listVendorSalesValidator = [
  query('vendor').optional({ values: 'falsy' }).isMongoId().withMessage('Invalid vendor'),
  query('store').optional({ values: 'falsy' }).isMongoId().withMessage('Invalid store'),
  query('warehouse').optional({ values: 'falsy' }).isMongoId().withMessage('Invalid warehouse'),
];

const createVendorSaleValidator = [
  body('vendor').isMongoId().withMessage('A valid vendor is required'),
  body('store').isMongoId().withMessage('A store is required'),
  body('warehouse').isMongoId().withMessage('A valid warehouse is required'),
  body('date').optional({ values: 'falsy' }).isISO8601().withMessage('Invalid date'),
  body('items').isArray({ min: 1 }).withMessage('At least one item is required'),
  body('items.*.product').isMongoId().withMessage('Each item needs a valid product'),
  body('items.*.quantity').isFloat({ gt: 0 }).withMessage('Each quantity must be positive'),
  body('items.*.unitPrice').optional({ values: 'falsy' }).isFloat({ min: 0 }),
  body('discount').optional({ values: 'falsy' }).isFloat({ min: 0 }),
  body('taxPercent').optional({ values: 'falsy' }).isFloat({ min: 0, max: 100 }),
  body('paymentMethod')
    .isIn(['CASH', 'CARD', 'BANK_TRANSFER', 'ONLINE', 'MIXED', 'CREDIT'])
    .withMessage('Invalid payment method'),
  body('cashAmount').optional({ values: 'falsy' }).isFloat({ min: 0 }),
  body('onlineAmount').optional({ values: 'falsy' }).isFloat({ min: 0 }),
  body('bankAccount').optional({ values: 'falsy' }).isMongoId().withMessage('Invalid bank account'),
  body('transferReceiptRef').optional({ values: 'falsy' }).trim().isLength({ max: 300 }),
  body('note').optional({ values: 'falsy' }).trim().isLength({ max: 500 }),
];

const updateVendorSaleValidator = [
  idParam,
  body('warehouse').optional({ values: 'falsy' }).isMongoId().withMessage('Invalid warehouse'),
  body('items').isArray({ min: 1 }).withMessage('At least one item is required'),
  body('items.*.product').isMongoId().withMessage('Each item needs a valid product'),
  body('items.*.quantity').isFloat({ gt: 0 }).withMessage('Each quantity must be positive'),
  body('items.*.unitPrice').optional({ values: 'falsy' }).isFloat({ min: 0 }),
  body('discount').optional({ values: 'falsy' }).isFloat({ min: 0 }),
  body('taxPercent').optional({ values: 'falsy' }).isFloat({ min: 0, max: 100 }),
  body('note').optional({ values: 'falsy' }).trim().isLength({ max: 500 }),
];

module.exports = {
  listVendorSalesValidator,
  createVendorSaleValidator,
  updateVendorSaleValidator,
  idParamValidator: [idParam],
};
