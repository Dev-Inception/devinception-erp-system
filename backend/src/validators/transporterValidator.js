const { body, param } = require('express-validator');

const idParam = param('id')
  .matches(/^[a-f\d]{24}$/i)
  .withMessage('Invalid transporter id');

// Optional contact/identifier fields shared by create and update.
const optionalFields = [
  body('phone').optional({ values: 'falsy' }).trim().isLength({ max: 30 }),
  body('vehicleNumber').optional({ values: 'falsy' }).trim().isLength({ max: 40 }),
  body('address').optional({ values: 'falsy' }).trim().isLength({ max: 300 }),
];

const createTransporterValidator = [
  body('name').trim().notEmpty().withMessage('Name is required').isLength({ max: 120 }),
  ...optionalFields,
];

const updateTransporterValidator = [
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

const chargeTransportValidator = [
  idParam,
  body('amount').isFloat({ gt: 0 }).withMessage('Amount must be positive'),
  body('store')
    .matches(/^[a-f\d]{24}$/i)
    .withMessage('A store is required'),
  body('date').optional({ values: 'falsy' }).isISO8601().withMessage('Invalid date'),
  body('note').optional({ values: 'falsy' }).trim().isLength({ max: 200 }),
];

module.exports = {
  createTransporterValidator,
  updateTransporterValidator,
  idParamValidator,
  chargeTransportValidator,
};
