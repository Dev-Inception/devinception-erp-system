const { body, param } = require('express-validator');

const BILLING_CYCLES = ['monthly', 'yearly', 'one_time'];
const STATUSES = ['active', 'inactive', 'expired', 'cancelled'];

const idParam = param('id').isMongoId().withMessage('Invalid subscription id');
const ownerIdParam = param('ownerId').isMongoId().withMessage('Invalid owner id');

const provisionValidator = [
  body('ownerName').trim().notEmpty().withMessage('Owner name is required').isLength({ max: 80 }),
  body('ownerEmail').trim().isEmail().withMessage('A valid owner email is required'),
  body('ownerPassword')
    .optional({ values: 'falsy' })
    .isLength({ min: 8 })
    .withMessage('Password must be at least 8 characters'),
  body('storeCount').isInt({ min: 1, max: 50 }).withMessage('storeCount must be between 1 and 50'),
  body('storeNames').optional().isArray().withMessage('storeNames must be an array'),
  body('storeNames.*').optional().trim().isLength({ max: 120 }),
  body('amountPerStore')
    .isFloat({ min: 0 })
    .withMessage('amountPerStore must be a positive number'),
  body('billingCycle').isIn(BILLING_CYCLES).withMessage('Invalid billing cycle'),
  body('notes').optional({ values: 'falsy' }).trim().isLength({ max: 1000 }),
];

const addStoreValidator = [
  ownerIdParam,
  body('storeName').trim().notEmpty().withMessage('Store name is required').isLength({ max: 120 }),
  body('amount').isFloat({ min: 0 }).withMessage('amount must be a positive number'),
  body('billingCycle').isIn(BILLING_CYCLES).withMessage('Invalid billing cycle'),
  body('notes').optional({ values: 'falsy' }).trim().isLength({ max: 1000 }),
];

const attachExistingStoreValidator = [
  ownerIdParam,
  body('storeId').isMongoId().withMessage('Invalid store id'),
];

const updateSubscriptionValidator = [
  idParam,
  body('amount').optional().isFloat({ min: 0 }).withMessage('amount must be a positive number'),
  body('billingCycle').optional().isIn(BILLING_CYCLES).withMessage('Invalid billing cycle'),
  body('status').optional().isIn(STATUSES).withMessage('Invalid status'),
  body('endsAt').optional({ values: 'falsy' }).isISO8601().withMessage('Invalid date'),
  body('notes').optional({ values: 'falsy' }).trim().isLength({ max: 1000 }),
];

module.exports = {
  provisionValidator,
  addStoreValidator,
  attachExistingStoreValidator,
  updateSubscriptionValidator,
};
