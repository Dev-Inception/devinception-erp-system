const express = require('express');
const supplierController = require('../controllers/supplierController');
const { protect } = require('../middlewares/authMiddleware');
const { requirePermission } = require('../middlewares/roleMiddleware');
const { validate } = require('../middlewares/validateMiddleware');
const { PERMISSIONS } = require('../utils/permissions');
const {
  createSupplierValidator,
  updateSupplierValidator,
  idParamValidator,
} = require('../validators/supplierValidator');

const router = express.Router();

// Every route here requires authentication.
router.use(protect);

router.get('/', requirePermission(PERMISSIONS.SUPPLIERS_READ), supplierController.listSuppliers);
router.get(
  '/:id',
  requirePermission(PERMISSIONS.SUPPLIERS_READ),
  idParamValidator,
  validate,
  supplierController.getSupplier,
);

router.post(
  '/',
  requirePermission(PERMISSIONS.SUPPLIERS_CREATE),
  createSupplierValidator,
  validate,
  supplierController.createSupplier,
);
router.patch(
  '/:id',
  requirePermission(PERMISSIONS.SUPPLIERS_UPDATE),
  updateSupplierValidator,
  validate,
  supplierController.updateSupplier,
);
router.delete(
  '/:id',
  requirePermission(PERMISSIONS.SUPPLIERS_DELETE),
  idParamValidator,
  validate,
  supplierController.deleteSupplier,
);

module.exports = router;
