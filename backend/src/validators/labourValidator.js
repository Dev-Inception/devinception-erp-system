const { body, param } = require('express-validator');

const idParam = param('id').isMongoId().withMessage('Invalid labour id');

const createLabourValidator = [
  body('name')
    .trim()
    .notEmpty()
    .withMessage('Labour name is required')
    .isString()
    .withMessage('Name must be a string')
    .isLength({ min: 2, max: 100 })
    .withMessage('Name must be between 2 and 100 characters'),
  body('phoneNumber')
    .trim()
    .notEmpty()
    .withMessage('Phone number is required')
    .isString()
    .withMessage('Phone number must be a string')
    .matches(/^[0-9+\-\s()]{10,15}$/)
    .withMessage('Please enter a valid phone number'),
];

const updateLabourValidator = [
  idParam,
  body('name')
    .optional()
    .trim()
    .isString()
    .withMessage('Name must be a string')
    .isLength({ min: 2, max: 100 })
    .withMessage('Name must be between 2 and 100 characters'),
  body('phoneNumber')
    .optional()
    .trim()
    .isString()
    .withMessage('Phone number must be a string')
    .matches(/^[0-9+\-\s()]{10,15}$/)
    .withMessage('Please enter a valid phone number'),
];

const idParamValidator = [idParam];

module.exports = {
  createLabourValidator,
  updateLabourValidator,
  idParamValidator,
};
