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
  // Values for the {{1}}, {{2}}… placeholders of the store's approved
  // template, when one is configured (see whatsappService).
  // Sent as a JSON string alongside the PDF in multipart requests.
  body('templateParams')
    .optional()
    .customSanitizer((v) => {
      if (typeof v !== 'string') return v;
      try {
        return JSON.parse(v);
      } catch {
        return v;
      }
    })
    .isArray({ max: 10 })
    .withMessage('Invalid template parameters'),
  body('templateParams.*').isString().isLength({ max: 1000 }),
];

module.exports = { sendEmailValidator, sendWhatsAppValidator };
