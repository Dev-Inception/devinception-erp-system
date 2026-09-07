const { body, param } = require('express-validator');

const idParam = param('id')
  .matches(/^[a-f\d]{24}$/i)
  .withMessage('Invalid vendor id');

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

// Pre-existing balance fields, shared by create and update — both are given
// as plain non-negative amounts (not a signed net figure) because a vendor
// can genuinely owe us and be owed by us at the same time; see
// vendorService.postVendorBalanceAdjustment for how each direction posts.
function balanceFields(storeMessage) {
  return [
    body('weOweAmount')
      .optional({ values: 'falsy' })
      .isFloat({ min: 0 })
      .withMessage('Amount must be non-negative'),
    body('theyOweAmount')
      .optional({ values: 'falsy' })
      .isFloat({ min: 0 })
      .withMessage('Amount must be non-negative'),
    body('store')
      .if(
        (_value, { req }) => Number(req.body.weOweAmount) > 0 || Number(req.body.theyOweAmount) > 0,
      )
      .isMongoId()
      .withMessage(storeMessage),
  ];
}

const createVendorValidator = [
  body('name').trim().notEmpty().withMessage('Name is required').isLength({ max: 120 }),
  ...optionalFields,
  ...balanceFields('A store is required for an opening balance'),
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
  ...balanceFields('A store is required for a balance adjustment'),
];

const idParamValidator = [idParam];

module.exports = {
  createVendorValidator,
  updateVendorValidator,
  idParamValidator,
};
