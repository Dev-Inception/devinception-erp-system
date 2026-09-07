const { body, param } = require('express-validator');

const idParam = param('id')
  .matches(/^[a-f\d]{24}$/i)
  .withMessage('Invalid pending entity id');

const idParamValidator = [idParam];

const setPriceValidator = [
  idParam,
  body('purchasePrice')
    .isFloat({ gt: 0 })
    .withMessage('Purchase price must be a positive number')
    .toFloat(),
];

module.exports = { idParamValidator, setPriceValidator };
