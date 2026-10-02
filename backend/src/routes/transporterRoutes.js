const express = require('express');
const transporterController = require('../controllers/transporterController');
const { protect } = require('../middlewares/authMiddleware');
const { requirePermission } = require('../middlewares/roleMiddleware');
const { validate } = require('../middlewares/validateMiddleware');
const { PERMISSIONS } = require('../utils/permissions');
const expenseController = require('../controllers/expenseController');
const {
  createTransporterValidator,
  updateTransporterValidator,
  idParamValidator,
  chargeTransportValidator,
} = require('../validators/transporterValidator');

const router = express.Router();

// Every route here requires authentication.
router.use(protect);

router.get(
  '/',
  requirePermission(PERMISSIONS.TRANSPORTERS_READ),
  transporterController.listTransporters,
);
router.get(
  '/:id',
  requirePermission(PERMISSIONS.TRANSPORTERS_READ),
  idParamValidator,
  validate,
  transporterController.getTransporter,
);

router.post(
  '/',
  requirePermission(PERMISSIONS.TRANSPORTERS_CREATE),
  createTransporterValidator,
  validate,
  transporterController.createTransporter,
);
router.patch(
  '/:id',
  requirePermission(PERMISSIONS.TRANSPORTERS_UPDATE),
  updateTransporterValidator,
  validate,
  transporterController.updateTransporter,
);
router.delete(
  '/:id',
  requirePermission(PERMISSIONS.TRANSPORTERS_DELETE),
  idParamValidator,
  validate,
  transporterController.deleteTransporter,
);

// Books a fare owed to this transporter (see transporterService.chargeTransport)
// — same permission as updating the transporter record itself.
router.post(
  '/:id/charges',
  requirePermission(PERMISSIONS.TRANSPORTERS_UPDATE),
  chargeTransportValidator,
  validate,
  transporterController.chargeTransport,
);

// Jobs + payouts: Labour/Transport expenses paid to this party against a
// sale invoice (see expenseService.listPayeePayments).
router.get(
  '/:id/payments',
  requirePermission(PERMISSIONS.TRANSPORTERS_READ),
  idParamValidator,
  validate,
  expenseController.listTransporterPayments,
);

module.exports = router;
