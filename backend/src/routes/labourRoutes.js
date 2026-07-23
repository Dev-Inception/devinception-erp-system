const express = require('express');
const labourController = require('../controllers/labourController');
const { protect } = require('../middlewares/authMiddleware');
const { authorize, requirePermission } = require('../middlewares/roleMiddleware');
const { validate } = require('../middlewares/validateMiddleware');
const { ROLES } = require('../utils/constants');
const { PERMISSIONS } = require('../utils/permissions');
const {
  createLabourValidator,
  updateLabourValidator,
  idParamValidator,
} = require('../validators/labourValidator');

const router = express.Router();

// Every route here requires authentication.
router.use(protect);

// List all labour
router.get('/', requirePermission(PERMISSIONS.SALES_CREATE), labourController.listLabour);

// Get single labour by ID
router.get(
  '/:id',
  requirePermission(PERMISSIONS.SALES_CREATE),
  idParamValidator,
  validate,
  labourController.getLabour,
);

// Create new labour
router.post(
  '/',
  authorize(ROLES.SUPER_ADMIN),
  createLabourValidator,
  validate,
  labourController.createLabour,
);

// Update labour
router.patch(
  '/:id',
  authorize(ROLES.SUPER_ADMIN),
  updateLabourValidator,
  validate,
  labourController.updateLabour,
);

router.put(
  '/:id',
  authorize(ROLES.SUPER_ADMIN),
  updateLabourValidator,
  validate,
  labourController.updateLabour,
);

// Delete labour
router.delete(
  '/:id',
  authorize(ROLES.SUPER_ADMIN),
  idParamValidator,
  validate,
  labourController.deleteLabour,
);

module.exports = router;
