const express = require('express');
const catalogController = require('../controllers/catalogController');
const { protect } = require('../middlewares/authMiddleware');
const { requirePermission } = require('../middlewares/roleMiddleware');
const { validate } = require('../middlewares/validateMiddleware');
const { PERMISSIONS } = require('../utils/permissions');
const {
  createCategoryValidator,
  createBrandValidator,
  createUnitValidator,
} = require('../validators/catalogValidator');

const router = express.Router();
router.use(protect);

// Reading the catalog (dropdowns) follows inventory-read; managing entries
// follows inventory-manage, like the products they classify.
router.get('/', requirePermission(PERMISSIONS.INVENTORY_READ), catalogController.getCatalog);
router.post(
  '/categories',
  requirePermission(PERMISSIONS.INVENTORY_MANAGE),
  createCategoryValidator,
  validate,
  catalogController.createCategory,
);
router.post(
  '/brands',
  requirePermission(PERMISSIONS.INVENTORY_MANAGE),
  createBrandValidator,
  validate,
  catalogController.createBrand,
);
router.post(
  '/units',
  requirePermission(PERMISSIONS.INVENTORY_MANAGE),
  createUnitValidator,
  validate,
  catalogController.createUnit,
);

module.exports = router;
