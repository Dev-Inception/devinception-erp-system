const { body } = require('express-validator');

const nameField = body('name')
  .trim()
  .notEmpty()
  .withMessage('A name is required')
  .isLength({ max: 80 })
  .withMessage('Name is too long');

const createCategoryValidator = [nameField];
const createBrandValidator = [nameField];
const createUnitValidator = [
  body('name').trim().notEmpty().withMessage('A name is required').isLength({ max: 40 }),
  body('abbreviation').optional({ values: 'falsy' }).trim().isLength({ max: 20 }),
];

module.exports = { createCategoryValidator, createBrandValidator, createUnitValidator };
