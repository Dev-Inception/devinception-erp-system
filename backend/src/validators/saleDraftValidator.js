const { body, param } = require('express-validator');

const idParamValidator = [
  param('id')
    .matches(/^[a-f\d]{24}$/i)
    .withMessage('Invalid draft id'),
];

const saveSaleDraftValidator = [
  body('store')
    .optional({ values: 'falsy' })
    .matches(/^[a-f\d]{24}$/i)
    .withMessage('Invalid store'),
  body('step').optional({ values: 'falsy' }).isInt({ min: 1, max: 5 }).withMessage('Invalid step'),
  body('customer').optional({ values: 'falsy' }).isObject(),
  body('customer.id')
    .optional({ values: 'falsy' })
    .matches(/^[a-f\d]{24}$/i),
  body('items').optional({ values: 'falsy' }).isArray().withMessage('Items must be an array'),
  body('items.*.productId')
    .optional()
    .matches(/^[a-f\d]{24}$/i)
    .withMessage('Invalid item product'),
  body('items.*.qty').optional().isFloat({ gt: 0 }).withMessage('Item qty must be positive'),
  body('items.*.source').optional({ values: 'falsy' }).isIn(['WAREHOUSE', 'VENDOR']),
  body('items.*.vendorId')
    .optional({ values: 'falsy' })
    .matches(/^[a-f\d]{24}$/i),
  body('labour').optional({ values: 'falsy' }).isArray().withMessage('Labour must be an array'),
  body('labour.*.id')
    .optional()
    .matches(/^[a-f\d]{24}$/i)
    .withMessage('Invalid labour id'),
  body('labour.*.rent').optional({ values: 'falsy' }).isFloat({ min: 0 }),
  body('driver').optional({ values: 'falsy' }).isObject(),
  body('transportFare').optional({ values: 'falsy' }).isFloat({ min: 0 }),
  body('discountValue').optional({ values: 'falsy' }).isFloat({ min: 0 }),
  body('discountType').optional({ values: 'falsy' }).isIn(['amount', 'percent']),
  body('taxPct').optional({ values: 'falsy' }).isFloat({ min: 0, max: 100 }),
  body('advanceAmount').optional({ values: 'falsy' }).isFloat({ min: 0 }),
];

module.exports = { idParamValidator, saveSaleDraftValidator };
