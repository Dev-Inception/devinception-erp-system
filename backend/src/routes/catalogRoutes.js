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
  updateCategoryValidator,
  updateUnitValidator,
  idParamValidator,
} = require('../validators/catalogValidator');

const router = express.Router();
router.use(protect);

// Reading the catalog (dropdowns) follows inventory-read; managing entries
// follows inventory-manage, like the products they classify.
router.get('/', requirePermission(PERMISSIONS.INVENTORY_READ), catalogController.getCatalog);
router.get(
  '/categories',
  requirePermission(PERMISSIONS.INVENTORY_READ),
  catalogController.listCategories,
);
router.get(
  '/categories/:id',
  requirePermission(PERMISSIONS.INVENTORY_READ),
  idParamValidator,
  validate,
  catalogController.getCategory,
);
router.post(
  '/categories',
  requirePermission(PERMISSIONS.INVENTORY_MANAGE),
  createCategoryValidator,
  validate,
  catalogController.createCategory,
);
router.patch(
  '/categories/:id',
  requirePermission(PERMISSIONS.INVENTORY_MANAGE),
  updateCategoryValidator,
  validate,
  catalogController.updateCategory,
);
router.delete(
  '/categories/:id',
  requirePermission(PERMISSIONS.INVENTORY_MANAGE),
  idParamValidator,
  validate,
  catalogController.deleteCategory,
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
router.get('/units', requirePermission(PERMISSIONS.INVENTORY_READ), catalogController.listUnits);
router.get(
  '/units/:id',
  requirePermission(PERMISSIONS.INVENTORY_READ),
  idParamValidator,
  validate,
  catalogController.getUnit,
);
router.patch(
  '/units/:id',
  requirePermission(PERMISSIONS.INVENTORY_MANAGE),
  updateUnitValidator,
  validate,
  catalogController.updateUnit,
);
router.delete(
  '/units/:id',
  requirePermission(PERMISSIONS.INVENTORY_MANAGE),
  idParamValidator,
  validate,
  catalogController.deleteUnit,
);

module.exports = router;
