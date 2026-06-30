const { body, param } = require('express-validator');

const idParam = param('id').isMongoId().withMessage('Invalid warehouse id');

const createWarehouseValidator = [
  body('name').trim().notEmpty().withMessage('Name is required').isLength({ max: 120 }),
  body('location').optional({ values: 'falsy' }).trim().isLength({ max: 120 }),
  body('address').optional({ values: 'falsy' }).trim().isLength({ max: 300 }),
  body('isDefault').optional().isBoolean().withMessage('isDefault must be a boolean'),
  body('isActive').optional().isBoolean().withMessage('isActive must be a boolean'),
];

const updateWarehouseValidator = [
  idParam,
  body('name')
    .optional()
    .trim()
    .notEmpty()
    .withMessage('Name cannot be empty')
    .isLength({ max: 120 }),
  body('location').optional({ values: 'falsy' }).trim().isLength({ max: 120 }),
  body('address').optional({ values: 'falsy' }).trim().isLength({ max: 300 }),
  body('isDefault').optional().isBoolean(),
  body('isActive').optional().isBoolean(),
];

const idParamValidator = [idParam];

module.exports = { createWarehouseValidator, updateWarehouseValidator, idParamValidator };
