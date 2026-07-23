const { body, param } = require('express-validator');

const idParam = param('id').isMongoId().withMessage('Invalid customer id');

// Optional fields shared by create and update.
const optionalFields = [
  body('phone').optional({ values: 'falsy' }).trim().isLength({ max: 30 }),
  body('email')
    .optional({ values: 'falsy' })
    .trim()
    .isEmail()
    .withMessage('A valid email is required')
    .normalizeEmail(),
  body('address').optional({ values: 'falsy' }).trim().isLength({ max: 300 }),
  body('creditLimit')
    .optional({ values: 'falsy' })
    .isFloat({ min: 0 })
    .withMessage('Credit limit must be a non-negative number')
    .toFloat(),
];

const createCustomerValidator = [
  body('name').trim().notEmpty().withMessage('Name is required').isLength({ max: 120 }),
  ...optionalFields,
];

const updateCustomerValidator = [
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
  createCustomerValidator,
  updateCustomerValidator,
  idParamValidator,
};
