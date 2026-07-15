const { body, param } = require('express-validator');

const nameField = body('name')
  .trim()
  .notEmpty()
  .withMessage('A name is required')
  .isLength({ max: 80 })
  .withMessage('Name is too long');

const descriptionField = body('description')
  .optional({ values: 'falsy' })
  .trim()
  .isLength({ max: 500 })
  .withMessage('Description is too long');

const createCategoryValidator = [nameField, descriptionField];
const createBrandValidator = [nameField];
const createUnitValidator = [
  body('name').trim().notEmpty().withMessage('A name is required').isLength({ max: 40 }),
  body('unit').custom((value, { req }) => {
    const unit = value || req.body.abbreviation;
    if (!unit || !String(unit).trim()) throw new Error('A unit is required');
    if (String(unit).trim().length > 20) throw new Error('Unit is too long');
    return true;
  }),
];

const idParamValidator = [param('id').isMongoId().withMessage('Invalid catalog id')];

const updateCategoryValidator = [
  ...idParamValidator,
  body('name')
    .optional()
    .trim()
    .notEmpty()
    .withMessage('Name cannot be empty')
    .isLength({ max: 80 }),
  descriptionField,
];

const updateUnitValidator = [
  ...idParamValidator,
  body('name')
    .optional()
    .trim()
    .notEmpty()
    .withMessage('Name cannot be empty')
    .isLength({ max: 40 }),
  body('unit')
    .optional()
    .trim()
    .notEmpty()
    .withMessage('Unit cannot be empty')
    .isLength({ max: 20 }),
  body('abbreviation')
    .optional()
    .trim()
    .notEmpty()
    .withMessage('Unit cannot be empty')
    .isLength({ max: 20 }),
];

module.exports = {
  createCategoryValidator,
  createBrandValidator,
  createUnitValidator,
  updateCategoryValidator,
  updateUnitValidator,
  idParamValidator,
};
