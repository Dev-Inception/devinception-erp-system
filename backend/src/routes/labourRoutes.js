const express = require('express');
const labourController = require('../controllers/labourController');
const { protect } = require('../middlewares/authMiddleware');
const { requirePermission } = require('../middlewares/roleMiddleware');
const { validate } = require('../middlewares/validateMiddleware');
const { PERMISSIONS } = require('../utils/permissions');
const expenseController = require('../controllers/expenseController');
const {
  createLabourValidator,
  updateLabourValidator,
  idParamValidator,
} = require('../validators/labourValidator');

const router = express.Router();

// Every route here requires authentication.
router.use(protect);

// List all labour
router.get('/', requirePermission(PERMISSIONS.LABOUR_READ), labourController.listLabour);

// Track: which labourers worked on a sale invoice and whether they've been
// paid for it (see expenseService.trackSaleLabour). Declared before /:id so
// "track" isn't taken for a labour id.
router.get(
  '/track/sales',
  requirePermission(PERMISSIONS.LABOUR_READ),
  expenseController.searchTrackableSales,
);
router.get(
  '/track/sales/:saleId',
  requirePermission(PERMISSIONS.LABOUR_READ),
  expenseController.trackSaleLabour,
);

// Get single labour by ID
router.get(
  '/:id',
  requirePermission(PERMISSIONS.LABOUR_READ),
  idParamValidator,
  validate,
  labourController.getLabour,
);

// Create new labour
router.post(
  '/',
  requirePermission(PERMISSIONS.LABOUR_CREATE),
  createLabourValidator,
  validate,
  labourController.createLabour,
);

// Update labour
router.patch(
  '/:id',
  requirePermission(PERMISSIONS.LABOUR_UPDATE),
  updateLabourValidator,
  validate,
  labourController.updateLabour,
);

router.put(
  '/:id',
  requirePermission(PERMISSIONS.LABOUR_UPDATE),
  updateLabourValidator,
  validate,
  labourController.updateLabour,
);

// Delete labour
router.delete(
  '/:id',
  requirePermission(PERMISSIONS.LABOUR_DELETE),
  idParamValidator,
  validate,
  labourController.deleteLabour,
);

// Jobs + payouts: Labour/Transport expenses paid to this party against a
// sale invoice (see expenseService.listPayeePayments).
router.get(
  '/:id/payments',
  requirePermission(PERMISSIONS.LABOUR_READ),
  idParamValidator,
  validate,
  expenseController.listLabourPayments,
);

module.exports = router;
