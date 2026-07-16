const { body, param, query } = require('express-validator');

const gatePassIdParamValidator = [
  param('gatePassId').isMongoId().withMessage('Invalid gate pass id'),
];

const saleParamValidator = [param('saleId').isMongoId().withMessage('Invalid sale id')];

const listGatePassValidator = [
  query('warehouse').optional({ values: 'falsy' }).isMongoId().withMessage('Invalid warehouse'),
  query('status')
    .optional({ values: 'falsy' })
    .toUpperCase()
    .isIn(['ACTIVE', 'USED', 'CANCELLED'])
    .withMessage('Invalid gate pass status'),
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
  listGatePassValidator,
  scanGatePassValidator,
};
