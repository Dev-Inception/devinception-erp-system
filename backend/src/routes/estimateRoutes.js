const express = require('express');
const estimateController = require('../controllers/estimateController');
const { protect } = require('../middlewares/authMiddleware');
const { requirePermission } = require('../middlewares/roleMiddleware');
const { validate } = require('../middlewares/validateMiddleware');
const { PERMISSIONS } = require('../utils/permissions');
const {
  createEstimateValidator,
  updateEstimateValidator,
  followUpValidator,
  markLostValidator,
  listEstimatesValidator,
  idParamValidator,
} = require('../validators/estimateValidator');

const router = express.Router();
router.use(protect);

router.get(
  '/',
  requirePermission(PERMISSIONS.ESTIMATES_READ),
  listEstimatesValidator,
  validate,
  estimateController.listEstimates,
);
router.get(
  '/:id',
  requirePermission(PERMISSIONS.ESTIMATES_READ),
  idParamValidator,
  validate,
  estimateController.getEstimate,
);
router.post(
  '/',
  requirePermission(PERMISSIONS.ESTIMATES_CREATE),
  createEstimateValidator,
  validate,
  estimateController.createEstimate,
);
router.patch(
  '/:id',
  requirePermission(PERMISSIONS.ESTIMATES_UPDATE),
  updateEstimateValidator,
  validate,
  estimateController.updateEstimate,
);
router.post(
  '/:id/follow-up',
  requirePermission(PERMISSIONS.ESTIMATES_UPDATE),
  followUpValidator,
  validate,
  estimateController.addFollowUp,
);
router.post(
  '/:id/lost',
  requirePermission(PERMISSIONS.ESTIMATES_UPDATE),
  markLostValidator,
  validate,
  estimateController.markLost,
);
router.delete(
  '/:id',
  requirePermission(PERMISSIONS.ESTIMATES_DELETE),
  idParamValidator,
  validate,
  estimateController.deleteEstimate,
);

module.exports = router;
