const express = require('express');
const pendingEntityController = require('../controllers/pendingEntityController');
const { protect } = require('../middlewares/authMiddleware');
const { authorize, requirePermission } = require('../middlewares/roleMiddleware');
const { validate } = require('../middlewares/validateMiddleware');
const { ROLES } = require('../utils/constants');
const { PERMISSIONS } = require('../utils/permissions');
const { idParamValidator, setPriceValidator } = require('../validators/pendingEntityValidator');

const router = express.Router();

// Every route here requires authentication.
router.use(protect);

router.get(
  '/',
  requirePermission(PERMISSIONS.FINANCE_READ),
  pendingEntityController.listPendingEntities,
);

router.get(
  '/:id',
  requirePermission(PERMISSIONS.FINANCE_READ),
  idParamValidator,
  validate,
  pendingEntityController.getPendingEntity,
);

// Only a super admin may put a price on a vendor's unpriced item — that's
// what actually creates the vendor's payable.
router.patch(
  '/:id/price',
  authorize(ROLES.SUPER_ADMIN),
  setPriceValidator,
  validate,
  pendingEntityController.setPrice,
);

module.exports = router;
