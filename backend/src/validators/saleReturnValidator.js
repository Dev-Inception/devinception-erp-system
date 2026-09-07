const { body, param } = require('express-validator');

const saleIdParam = param('saleId').isMongoId().withMessage('Invalid sale id');

const createReturnValidator = [
  saleIdParam,
  body('items').isArray({ min: 1 }).withMessage('At least one returned item is required'),
  body('items.*.product').isMongoId().withMessage('Each returned item needs a valid product'),
  body('items.*.quantity')
    .isFloat({ gt: 0 })
    .withMessage('Each returned quantity must be positive'),
  body('note').optional({ values: 'falsy' }).isString().trim().isLength({ max: 500 }),
];

const listReturnsValidator = [saleIdParam];

module.exports = { createReturnValidator, listReturnsValidator };
