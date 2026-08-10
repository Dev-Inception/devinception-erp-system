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

// Driver/vehicle capture is optional — the gatekeeper flow no longer asks for
// it (accountability comes from the logged-in gatekeeper's identity instead),
// but the admin edit form may still record it for a delivery.
const processingFieldsValidator = [
  body('driver.name').optional({ values: 'falsy' }).trim().isLength({ max: 120 }),
  body('driver.phone').optional({ values: 'falsy' }).trim().isLength({ max: 40 }),
  body('driver.licenseNumber').optional({ values: 'falsy' }).trim().isLength({ max: 80 }),
  body('driver.vehicleNumber').optional({ values: 'falsy' }).trim().isLength({ max: 80 }),
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
  listGatePassValidator,
  processGatePassValidator,
  adminUpdateGatePassValidator,
  publicTokenParamValidator,
};
