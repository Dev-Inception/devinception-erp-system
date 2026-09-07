const { body, param } = require('express-validator');

const idParam = param('id')
  .matches(/^[a-f\d]{24}$/i)
  .withMessage('Invalid store id');

const createStoreValidator = [
  body('name').trim().notEmpty().withMessage('Name is required').isLength({ max: 120 }),
  body('code').optional({ values: 'falsy' }).trim().isLength({ max: 20 }),
  body('address').optional({ values: 'falsy' }).trim().isLength({ max: 300 }),
  body('warehouses').optional().isArray().withMessage('warehouses must be an array'),
  body('warehouses.*')
    .matches(/^[a-f\d]{24}$/i)
    .withMessage('Each warehouse must be a valid id'),
  body('isDefault').optional().isBoolean().withMessage('isDefault must be a boolean'),
  body('isActive').optional().isBoolean().withMessage('isActive must be a boolean'),
];

const updateStoreValidator = [
  idParam,
  body('name')
    .optional()
    .trim()
    .notEmpty()
    .withMessage('Name cannot be empty')
    .isLength({ max: 120 }),
  body('code').optional({ values: 'falsy' }).trim().isLength({ max: 20 }),
  body('address').optional({ values: 'falsy' }).trim().isLength({ max: 300 }),
  body('warehouses').optional().isArray().withMessage('warehouses must be an array'),
  body('warehouses.*')
    .matches(/^[a-f\d]{24}$/i)
    .withMessage('Each warehouse must be a valid id'),
  body('isDefault').optional().isBoolean(),
  body('isActive').optional().isBoolean(),
];

const idParamValidator = [idParam];

module.exports = { createStoreValidator, updateStoreValidator, idParamValidator };
