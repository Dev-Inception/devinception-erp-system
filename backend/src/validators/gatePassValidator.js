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
    .isIn(['PENDING', 'PROCESSED', 'CANCELLED'])
    .withMessage('Invalid gate pass status'),
  query('sourceType')
    .optional({ values: 'falsy' })
    .toUpperCase()
    .isIn(['SALE', 'PURCHASE'])
    .withMessage('Invalid gate pass source type'),
];

const publicTokenParamValidator = [
  param('token')
    .isString()
    .trim()
    .notEmpty()
    .withMessage('A gate pass token is required')
    .isLength({ max: 200 })
    .withMessage('Invalid gate pass token'),
];

const processingFieldsValidator = [
  body('driver.name')
    .trim()
    .notEmpty()
    .isLength({ max: 120 })
    .withMessage('Driver name is required'),
  body('driver.phone').optional({ values: 'falsy' }).trim().isLength({ max: 40 }),
  body('driver.licenseNumber').optional({ values: 'falsy' }).trim().isLength({ max: 80 }),
  body('driver.vehicleNumber')
    .trim()
    .notEmpty()
    .isLength({ max: 80 })
    .withMessage('Vehicle number is required'),
  body('loadNotes').optional({ values: 'falsy' }).trim().isLength({ max: 1000 }),
  body('items').isArray({ min: 1 }).withMessage('Every loaded item must be submitted'),
  body('items.*.productId').isMongoId().withMessage('Invalid gate pass product'),
  body('items.*.loadedQuantity')
    .isFloat({ min: 0 })
    .toFloat()
    .withMessage('Loaded quantity must be zero or greater'),
  body('items.*.loadConfirmed')
    .equals('true')
    .toBoolean()
    .withMessage('Every item quantity must be confirmed'),
];

const processGatePassValidator = [
  ...publicTokenParamValidator,
  ...processingFieldsValidator,
  body('signatureData')
    .isString()
    .matches(/^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/)
    .isLength({ max: 500000 })
    .withMessage('A valid digital signature is required'),
];

const adminUpdateGatePassValidator = [
  ...gatePassIdParamValidator,
  ...processingFieldsValidator,
  body('signatureData')
    .optional({ values: 'falsy' })
    .isString()
    .matches(/^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/)
    .isLength({ max: 500000 })
    .withMessage('Invalid digital signature'),
];

module.exports = {
  gatePassIdParamValidator,
  saleParamValidator,
  purchaseParamValidator,
  listGatePassValidator,
  processGatePassValidator,
  adminUpdateGatePassValidator,
  publicTokenParamValidator,
};
