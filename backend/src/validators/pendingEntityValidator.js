const { body, param, query } = require('express-validator');

const idParam = param('id').isMongoId().withMessage('Invalid pending entity id');

const idParamValidator = [idParam];

const invoiceItemsValidator = [
  query('sourceType').isIn(['SALE_ITEM', 'STOCK_RECEIPT_ITEM']).withMessage('Invalid source type'),
  query('sourceNo').trim().notEmpty().withMessage('sourceNo is required'),
];

const setPriceValidator = [
  idParam,
  body('purchasePrice')
    .isFloat({ gt: 0 })
    .withMessage('Purchase price must be a positive number')
    .toFloat(),
];

module.exports = { idParamValidator, setPriceValidator, invoiceItemsValidator };
