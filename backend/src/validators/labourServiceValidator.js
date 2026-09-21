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

const storeField = body('store')
  .optional({ values: 'falsy' })
  .isMongoId()
  .withMessage('Invalid store');

const idParamValidator = [param('id').isMongoId().withMessage('Invalid labour service id')];

const createLabourServiceValidator = [nameField, descriptionField, storeField];

const updateLabourServiceValidator = [
  ...idParamValidator,
  body('name')
    .optional()
    .trim()
    .notEmpty()
    .withMessage('Name cannot be empty')
    .isLength({ max: 80 }),
  descriptionField,
];

module.exports = {
  createLabourServiceValidator,
  updateLabourServiceValidator,
  idParamValidator,
};
