const { body, param, query } = require('express-validator');

const idParam = param('id').isMongoId().withMessage('Invalid pending entity id');

const idParamValidator = [idParam];

const invoiceItemsValidator = [
  query('kind').isIn(['SALE', 'STOCK_RECEIPT']).withMessage('Invalid invoice kind'),
  query('sourceId').isMongoId().withMessage('Invalid source id'),
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
