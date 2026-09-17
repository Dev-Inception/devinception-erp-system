const { body, param } = require('express-validator');

const vendorSaleIdParam = param('vendorSaleId').isMongoId().withMessage('Invalid vendor sale id');

const createVendorSaleReturnValidator = [
  vendorSaleIdParam,
  body('items').isArray({ min: 1 }).withMessage('At least one returned item is required'),
  body('items.*.product').isMongoId().withMessage('Each returned item needs a valid product'),
  body('items.*.quantity')
    .isFloat({ gt: 0 })
    .withMessage('Each returned quantity must be positive'),
  body('note').optional({ values: 'falsy' }).isString().trim().isLength({ max: 500 }),
];

const listVendorSaleReturnsValidator = [vendorSaleIdParam];

module.exports = { createVendorSaleReturnValidator, listVendorSaleReturnsValidator };
