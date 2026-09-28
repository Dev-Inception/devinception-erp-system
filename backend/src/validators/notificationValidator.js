const { body } = require('express-validator');

const sendEmailValidator = [
  body('store').optional({ values: 'falsy' }).isMongoId().withMessage('Invalid store'),
  body('to').trim().isEmail().withMessage('A valid recipient email is required'),
  body('subject').trim().notEmpty().withMessage('A subject is required').isLength({ max: 200 }),
  body('html').trim().notEmpty().withMessage('Nothing to send'),
];

const sendWhatsAppValidator = [
  body('store').optional({ values: 'falsy' }).isMongoId().withMessage('Invalid store'),
  body('to').trim().notEmpty().withMessage('A recipient phone number is required'),
  body('message').trim().notEmpty().withMessage('Nothing to send').isLength({ max: 4000 }),
];

module.exports = { sendEmailValidator, sendWhatsAppValidator };
