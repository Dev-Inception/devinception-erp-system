const { body } = require('express-validator');

// All fields optional — a settings update is a partial patch of the singleton.
const updateSettingsValidator = [
  body('companyName').optional({ values: 'falsy' }).trim().isLength({ max: 160 }),
  body('address').optional({ values: 'falsy' }).trim().isLength({ max: 300 }),
  body('phone').optional({ values: 'falsy' }).trim().isLength({ max: 40 }),
  body('email').optional({ values: 'falsy' }).trim().isEmail().withMessage('Invalid email'),
  body('taxNumber').optional({ values: 'falsy' }).trim().isLength({ max: 60 }),
  body('currency').optional({ values: 'falsy' }).trim().isLength({ max: 10 }),
];

module.exports = { updateSettingsValidator };
