const express = require('express');
const labourServiceController = require('../controllers/labourServiceController');
const { protect } = require('../middlewares/authMiddleware');
const { requirePermission } = require('../middlewares/roleMiddleware');
const { validate } = require('../middlewares/validateMiddleware');
const { PERMISSIONS } = require('../utils/permissions');
const {
  createLabourServiceValidator,
  updateLabourServiceValidator,
  idParamValidator,
} = require('../validators/labourServiceValidator');

const router = express.Router();
router.use(protect);

// Labour services are a catalog entity (like categories/units), so they
// follow the same inventory:read/inventory:manage split.
router.get(
  '/',
  requirePermission(PERMISSIONS.INVENTORY_READ),
  labourServiceController.listLabourServices,
);
router.get(
  '/:id',
  requirePermission(PERMISSIONS.INVENTORY_READ),
  idParamValidator,
  validate,
  labourServiceController.getLabourService,
);
router.post(
  '/',
  requirePermission(PERMISSIONS.INVENTORY_MANAGE),
  createLabourServiceValidator,
  validate,
  labourServiceController.createLabourService,
);
router.patch(
  '/:id',
  requirePermission(PERMISSIONS.INVENTORY_MANAGE),
  updateLabourServiceValidator,
  validate,
  labourServiceController.updateLabourService,
);
router.delete(
  '/:id',
  requirePermission(PERMISSIONS.INVENTORY_MANAGE),
  idParamValidator,
  validate,
  labourServiceController.deleteLabourService,
);

module.exports = router;
