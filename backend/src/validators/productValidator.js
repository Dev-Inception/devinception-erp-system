const { body, param, query } = require('express-validator');
const { isValidId } = require('../db/id');

const idParam = param('id')
  .matches(/^[a-f\d]{24}$/i)
  .withMessage('Invalid product id');

const optionalFields = [
  body('barcode').optional({ values: 'falsy' }).trim().isLength({ max: 60 }),
  // Catalog refs by id (preferred) ...
  body('categoryId')
    .optional({ values: 'falsy' })
    .matches(/^[a-f\d]{24}$/i)
    .withMessage('Invalid category'),
  body('brandId')
    .optional({ values: 'falsy' })
    .matches(/^[a-f\d]{24}$/i)
    .withMessage('Invalid brand'),
  body('unitId')
    .optional({ values: 'falsy' })
    .matches(/^[a-f\d]{24}$/i)
    .withMessage('Invalid unit'),
  // ... or by free-text name (find-or-create; also accepts legacy payloads).
  body('category').optional({ values: 'falsy' }).trim().isLength({ max: 80 }),
  body('brand').optional({ values: 'falsy' }).trim().isLength({ max: 80 }),
  body('unit').optional({ values: 'falsy' }).trim().isLength({ max: 80 }),
  body('purchasePrice')
    .optional({ values: 'falsy' })
    .isFloat({ min: 0 })
    .withMessage('Purchase price must be non-negative'),
  body('salePrice')
    .optional({ values: 'falsy' })
    .isFloat({ min: 0 })
    .withMessage('Sale price must be non-negative'),
  body('taxPercent')
    .optional({ values: 'falsy' })
    .isFloat({ min: 0, max: 100 })
    .withMessage('Tax % must be 0–100'),
  body('minStock')
    .optional({ values: 'falsy' })
    .isInt({ min: 0 })
    .toInt()
    .withMessage('Min stock must be a non-negative whole number'),
];

const createProductValidator = [
  body('name').trim().notEmpty().withMessage('Name is required').isLength({ max: 160 }),
  body('sku').trim().notEmpty().withMessage('SKU is required').isLength({ max: 60 }),
  body('warehouse').custom((value, { req }) => {
    const warehouse = value || req.body.warehouseId;
    if (!isValidId(warehouse)) {
      throw new Error('A valid warehouse is required');
    }
    return true;
  }),
  ...optionalFields,
];

const updateProductValidator = [
  idParam,
  body('name')
    .optional()
    .trim()
    .notEmpty()
    .withMessage('Name cannot be empty')
    .isLength({ max: 160 }),
  body('sku').optional().trim().notEmpty().withMessage('SKU cannot be empty').isLength({ max: 60 }),
  body('isActive').optional().isBoolean(),
  ...optionalFields,
];

const ADJUST_TYPES = ['STOCK_IN', 'STOCK_OUT', 'DAMAGED', 'ADJUSTMENT'];

// An adjustment is either a first-class `type` + `quantity` or a signed
// `delta`. Both are validated as optional here; the service enforces that at
// least one is supplied (and resolves the resulting change).
const adjustStockValidator = [
  idParam,
  body('warehouse')
    .matches(/^[a-f\d]{24}$/i)
    .withMessage('A valid warehouse is required'),
  body('type')
    .optional({ values: 'falsy' })
    .isIn(ADJUST_TYPES)
    .withMessage('Invalid adjustment type'),
  body('quantity')
    .optional({ values: 'falsy' })
    .isInt({ min: 0 })
    .toInt()
    .withMessage('quantity must be a non-negative whole number'),
  body('delta')
    .optional({ values: 'falsy' })
    .isInt()
    .toInt()
    .withMessage('delta must be a whole number'),
  body('unitCost')
    .optional({ values: 'falsy' })
    .isFloat({ min: 0 })
    .withMessage('unitCost must be non-negative'),
  body('note').optional({ values: 'falsy' }).trim().isLength({ max: 200 }),
];

const stockLookupValidator = [
  idParam,
  query('warehouse')
    .optional({ values: 'falsy' })
    .matches(/^[a-f\d]{24}$/i)
    .withMessage('Invalid warehouse'),
];

const idParamValidator = [idParam];

module.exports = {
  createProductValidator,
  updateProductValidator,
  adjustStockValidator,
  stockLookupValidator,
  idParamValidator,
};
