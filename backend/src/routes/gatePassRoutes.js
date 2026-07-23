const express = require('express');
const gatePassController = require('../controllers/gatePassController');
const { protect } = require('../middlewares/authMiddleware');
const { authorize, requirePermission } = require('../middlewares/roleMiddleware');
const { validate } = require('../middlewares/validateMiddleware');
const { PERMISSIONS } = require('../utils/permissions');
const { ROLES } = require('../utils/constants');
const {
  gatePassIdParamValidator,
  saleParamValidator,
  purchaseParamValidator,
  listGatePassValidator,
  adminUpdateGatePassValidator,
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
router.get(
  '/sale/:saleId',
  requirePermission(PERMISSIONS.INVENTORY_READ),
  saleParamValidator,
  validate,
  gatePassController.getGatePassBySale,
);
router.get(
  '/purchase/:purchaseId',
  requirePermission(PERMISSIONS.INVENTORY_READ),
  purchaseParamValidator,
  validate,
  gatePassController.getGatePassByPurchase,
);
router.get(
  '/:gatePassId/qr',
  requirePermission(PERMISSIONS.INVENTORY_READ),
  gatePassIdParamValidator,
  validate,
  gatePassController.downloadQr,
);
router.get(
  '/:gatePassId',
  requirePermission(PERMISSIONS.INVENTORY_READ),
  gatePassIdParamValidator,
  validate,
  gatePassController.getGatePass,
);
router.patch(
  '/:gatePassId',
  authorize(ROLES.ADMIN, ROLES.SUPER_ADMIN),
  adminUpdateGatePassValidator,
  validate,
  gatePassController.updateProcessedGatePass,
);

module.exports = router;
