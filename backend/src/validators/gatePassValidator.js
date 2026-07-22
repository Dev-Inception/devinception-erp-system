const { body, param, query } = require('express-validator');

const gatePassIdParamValidator = [
  param('gatePassId').isMongoId().withMessage('Invalid gate pass id'),
];

const saleParamValidator = [param('saleId').isMongoId().withMessage('Invalid sale id')];
const purchaseParamValidator = [param('purchaseId').isMongoId().withMessage('Invalid purchase id')];

const listGatePassValidator = [
  query('warehouse').optional({ values: 'falsy' }).isMongoId().withMessage('Invalid warehouse'),
  query('status')
    .optional({ values: 'falsy' })
    .toUpperCase()
    .isIn(['ACTIVE', 'USED', 'CANCELLED'])
    .withMessage('Invalid gate pass status'),
  query('sourceType')
    .optional({ values: 'falsy' })
    .toUpperCase()
    .isIn(['SALE', 'PURCHASE'])
    .withMessage('Invalid gate pass source type'),
];

const scanGatePassValidator = [
  body('token')
    .isString()
    .trim()
    .notEmpty()
    .withMessage('A gate pass QR token is required')
    .isLength({ max: 200 })
    .withMessage('Invalid gate pass QR token'),
];

module.exports = {
  gatePassIdParamValidator,
  saleParamValidator,
  purchaseParamValidator,
  listGatePassValidator,
  scanGatePassValidator,
};
