const { body, param } = require('express-validator');

const idParam = param('id').isMongoId().withMessage('Invalid vendor id');

// Optional contact/identifier fields shared by create and update.
const optionalFields = [
  body('phone').optional({ values: 'falsy' }).trim().isLength({ max: 30 }),
  body('email')
    .optional({ values: 'falsy' })
    .trim()
    .isEmail()
    .withMessage('A valid email is required')
    .normalizeEmail(),
  body('ntn').optional({ values: 'falsy' }).trim().isLength({ max: 40 }),
  body('address').optional({ values: 'falsy' }).trim().isLength({ max: 300 }),
];

const createVendorValidator = [
  body('name').trim().notEmpty().withMessage('Name is required').isLength({ max: 120 }),
  ...optionalFields,
];

const updateVendorValidator = [
  idParam,
  body('name')
    .optional()
    .trim()
    .notEmpty()
    .withMessage('Name cannot be empty')
    .isLength({ max: 120 }),
  ...optionalFields,
];

const idParamValidator = [idParam];

module.exports = {
  createVendorValidator,
  updateVendorValidator,
  idParamValidator,
};
