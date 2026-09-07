const { body, param, query } = require('express-validator');

const idParam = param('id').isMongoId().withMessage('Invalid estimate id');

// Shared by create and update — customer/items/discount/tax/notes.
const estimateFieldsValidator = [
  body('customer').optional({ values: 'falsy' }).isMongoId().withMessage('Invalid customer'),
  body('customerName')
    .if(body('customer').not().exists({ values: 'falsy' }))
    .trim()
    .notEmpty()
    .withMessage('A customer name is required')
    .isLength({ max: 120 }),
  body('customerPhone').optional({ values: 'falsy' }).trim().isLength({ max: 40 }),
  body('customerAddress').optional({ values: 'falsy' }).trim().isLength({ max: 240 }),
  body('items').isArray({ min: 1 }).withMessage('At least one item is required'),
  body('items.*.product').isMongoId().withMessage('Each item needs a valid product'),
  body('items.*.quantity').isFloat({ gt: 0 }).withMessage('Each item quantity must be positive'),
  body('items.*.unitPrice')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Unit price must be non-negative'),
  body('discount')
    .optional({ values: 'falsy' })
    .isFloat({ min: 0 })
    .withMessage('Discount must be non-negative'),
  body('taxPercent')
    .optional({ values: 'falsy' })
    .isFloat({ min: 0, max: 100 })
    .withMessage('Tax % must be 0–100'),
  body('notes').optional({ values: 'falsy' }).trim().isLength({ max: 1000 }),
];

const createEstimateValidator = [
  body('store').optional({ values: 'falsy' }).isMongoId().withMessage('Invalid store'),
  body('date').optional({ values: 'falsy' }).isISO8601().withMessage('Invalid date'),
  ...estimateFieldsValidator,
];

const updateEstimateValidator = [idParam, ...estimateFieldsValidator];

const followUpValidator = [
  idParam,
  body('note').trim().notEmpty().withMessage('A follow-up note is required').isLength({ max: 500 }),
  body('nextFollowUpDate')
    .optional({ values: 'falsy' })
    .isISO8601()
    .withMessage('Invalid follow-up date'),
];

const markLostValidator = [
  idParam,
  body('reason').optional({ values: 'falsy' }).trim().isLength({ max: 500 }),
];

const listEstimatesValidator = [
  query('status')
    .optional({ values: 'falsy' })
    .isIn(['PENDING', 'FOLLOWED_UP', 'CONVERTED', 'LOST'])
    .withMessage('Invalid status'),
  query('store').optional({ values: 'falsy' }).isMongoId().withMessage('Invalid store'),
  query('from').optional({ values: 'falsy' }).isISO8601().withMessage('Invalid from date'),
  query('to').optional({ values: 'falsy' }).isISO8601().withMessage('Invalid to date'),
];

const idParamValidator = [idParam];

module.exports = {
  createEstimateValidator,
  updateEstimateValidator,
  followUpValidator,
  markLostValidator,
  listEstimatesValidator,
  idParamValidator,
};
