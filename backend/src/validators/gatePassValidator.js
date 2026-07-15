const { body, param, query } = require('express-validator');

const idParamValidator = [param('id').isMongoId().withMessage('Invalid gate pass id')];

const sourceParamValidator = [
  param('sourceType')
    .toUpperCase()
    .isIn(['PURCHASE', 'SALE'])
    .withMessage('Source type must be PURCHASE or SALE'),
  param('sourceId').isMongoId().withMessage('Invalid source id'),
];

const listGatePassValidator = [
  query('sourceType')
    .optional({ values: 'falsy' })
    .toUpperCase()
    .isIn(['PURCHASE', 'SALE'])
    .withMessage('Source type must be PURCHASE or SALE'),
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
  idParamValidator,
  sourceParamValidator,
  listGatePassValidator,
  scanGatePassValidator,
};
