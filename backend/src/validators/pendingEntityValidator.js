const { body, param, query } = require('express-validator');

const idParam = param('id').isMongoId().withMessage('Invalid pending entity id');

const idParamValidator = [idParam];

const invoiceItemsValidator = [
  query('sourceType')
    .isIn(['SALE_ITEM', 'STOCK_RECEIPT_ITEM', 'SALE_LABOUR'])
    .withMessage('Invalid source type'),
  query('sourceNo').trim().notEmpty().withMessage('sourceNo is required'),
];

const setPriceValidator = [
  idParam,
  // >= 0 here: a labour payout may legitimately be 0. The service still
  // requires a positive price for vendor/supplier items.
  body('purchasePrice')
    .isFloat({ min: 0 })
    .withMessage('Purchase price must be a non-negative number')
    .toFloat(),
];

module.exports = { idParamValidator, setPriceValidator, invoiceItemsValidator };
