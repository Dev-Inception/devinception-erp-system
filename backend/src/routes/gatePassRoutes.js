const express = require('express');
const gatePassController = require('../controllers/gatePassController');
const { protect } = require('../middlewares/authMiddleware');
const { requirePermission } = require('../middlewares/roleMiddleware');
const { validate } = require('../middlewares/validateMiddleware');
const { PERMISSIONS } = require('../utils/permissions');
const {
  idParamValidator,
  sourceParamValidator,
  listGatePassValidator,
  scanGatePassValidator,
} = require('../validators/gatePassValidator');

const router = express.Router();
router.use(protect);

router.get(
  '/',
  requirePermission(PERMISSIONS.INVENTORY_READ),
  listGatePassValidator,
  validate,
  gatePassController.listGatePasses,
);
router.post(
  '/scan',
  requirePermission(PERMISSIONS.INVENTORY_MANAGE),
  scanGatePassValidator,
  validate,
  gatePassController.scanGatePass,
);
router.get(
  '/source/:sourceType/:sourceId',
  requirePermission(PERMISSIONS.INVENTORY_READ),
  sourceParamValidator,
  validate,
  gatePassController.getGatePassBySource,
);
router.get(
  '/:id/qr',
  requirePermission(PERMISSIONS.INVENTORY_READ),
  idParamValidator,
  validate,
  gatePassController.downloadQr,
);
router.get(
  '/:id',
  requirePermission(PERMISSIONS.INVENTORY_READ),
  idParamValidator,
  validate,
  gatePassController.getGatePass,
);

module.exports = router;
