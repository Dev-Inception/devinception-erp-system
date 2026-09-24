const { body } = require('express-validator');

// All fields optional — a settings update is a partial patch of the singleton.
const updateSettingsValidator = [
  body('companyName').optional({ values: 'falsy' }).trim().isLength({ max: 160 }),
  body('address').optional({ values: 'falsy' }).trim().isLength({ max: 300 }),
  body('phone').optional({ values: 'falsy' }).trim().isLength({ max: 40 }),
  body('email').optional({ values: 'falsy' }).trim().isEmail().withMessage('Invalid email'),
  body('taxNumber').optional({ values: 'falsy' }).trim().isLength({ max: 60 }),
  body('currency').optional({ values: 'falsy' }).trim().isLength({ max: 10 }),
  body('invoiceNote').optional({ values: 'falsy' }).trim().isLength({ max: 1000 }),
  // A base64 data URL, same convention/size cap as the product image (see
  // productValidator) — the frontend resizes before upload.
  body('logoUrl')
    .optional({ values: 'falsy' })
    .isString()
    .matches(/^data:image\/(png|jpe?g|webp);base64,[A-Za-z0-9+/=]+$/)
    .withMessage('Logo must be a valid png/jpeg/webp data URL')
    .isLength({ max: 300000 })
    .withMessage('Logo is too large'),
  body('facebook')
    .optional({ values: 'falsy' })
    .trim()
    .isURL({ require_protocol: false })
    .withMessage('Invalid Facebook URL')
    .isLength({ max: 300 }),
  body('instagram')
    .optional({ values: 'falsy' })
    .trim()
    .isURL({ require_protocol: false })
    .withMessage('Invalid Instagram URL')
    .isLength({ max: 300 }),
  body('gmail').optional({ values: 'falsy' }).trim().isEmail().withMessage('Invalid Gmail address'),
  body('tiktok')
    .optional({ values: 'falsy' })
    .trim()
    .isURL({ require_protocol: false })
    .withMessage('Invalid TikTok URL')
    .isLength({ max: 300 }),
  body('website')
    .optional({ values: 'falsy' })
    .trim()
    .isURL({ require_protocol: false })
    .withMessage('Invalid website URL')
    .isLength({ max: 300 }),
  body('store').optional({ values: 'falsy' }).isMongoId().withMessage('Invalid store'),
  // Notification config (SMTP + Twilio WhatsApp) — see docs/INTEGRATIONS.md.
  body('smtpHost').optional({ values: 'falsy' }).trim().isLength({ max: 200 }),
  body('smtpPort').optional({ values: 'falsy' }).isInt({ min: 1, max: 65535 }).toInt(),
  body('smtpUser').optional({ values: 'falsy' }).trim().isLength({ max: 200 }),
  body('smtpPass').optional({ values: 'falsy' }).isLength({ max: 300 }),
  body('smtpFrom').optional({ values: 'falsy' }).trim().isLength({ max: 200 }),
  body('twilioAccountSid').optional({ values: 'falsy' }).trim().isLength({ max: 120 }),
  body('twilioAuthToken').optional({ values: 'falsy' }).trim().isLength({ max: 120 }),
  body('twilioWhatsAppFrom').optional({ values: 'falsy' }).trim().isLength({ max: 40 }),
  body('labourPricingMode')
    .optional({ values: 'falsy' })
    .isIn(['DIRECT', 'PENDING'])
    .withMessage('Labour pricing mode must be DIRECT or PENDING'),
];

module.exports = { updateSettingsValidator };
