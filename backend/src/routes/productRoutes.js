const express = require('express');
const productController = require('../controllers/productController');
const { protect } = require('../middlewares/authMiddleware');
const { requirePermission } = require('../middlewares/roleMiddleware');
const { validate } = require('../middlewares/validateMiddleware');
const { PERMISSIONS } = require('../utils/permissions');
const {
  createProductValidator,
  updateProductValidator,
  adjustStockValidator,
  stockLookupValidator,
  idParamValidator,
} = require('../validators/productValidator');

const router = express.Router();
router.use(protect);

router.get('/', requirePermission(PERMISSIONS.INVENTORY_READ), productController.listProducts);
router.get(
  '/:id',
  requirePermission(PERMISSIONS.INVENTORY_READ),
  idParamValidator,
  validate,
  productController.getProduct,
);
// Cheap per-product (optionally per-warehouse) current-stock lookup.
router.get(
  '/:id/stock',
  requirePermission(PERMISSIONS.INVENTORY_READ),
  stockLookupValidator,
  validate,
  productController.getStock,
);
router.post(
  '/',
  requirePermission(PERMISSIONS.INVENTORY_MANAGE),
  createProductValidator,
  validate,
  productController.createProduct,
);
router.patch(
  '/:id',
  requirePermission(PERMISSIONS.INVENTORY_MANAGE),
  updateProductValidator,
  validate,
  productController.updateProduct,
);
router.put(
  '/:id',
  requirePermission(PERMISSIONS.INVENTORY_MANAGE),
  updateProductValidator,
  validate,
  productController.updateProduct,
);
router.post(
  '/:id/adjust-stock',
  requirePermission(PERMISSIONS.INVENTORY_MANAGE),
  adjustStockValidator,
  validate,
  productController.adjustStock,
);
router.delete(
  '/:id',
  requirePermission(PERMISSIONS.INVENTORY_MANAGE),
  idParamValidator,
  validate,
  productController.deleteProduct,
);

module.exports = router;
