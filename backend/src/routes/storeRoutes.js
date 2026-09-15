const express = require('express');
const storeController = require('../controllers/storeController');
const { protect } = require('../middlewares/authMiddleware');
const { requirePermission, authorize } = require('../middlewares/roleMiddleware');
const { validate } = require('../middlewares/validateMiddleware');
const { PERMISSIONS } = require('../utils/permissions');
const { ROLES } = require('../utils/constants');
const {
  createStoreValidator,
  updateStoreValidator,
  idParamValidator,
} = require('../validators/storeValidator');

const router = express.Router();
router.use(protect);

// Listing stores is open to any authenticated user (not gated by
// stores:read) — every user, regardless of role, must be able to populate
// the mandatory login picker and the header switcher, not just admins.
router.get('/', storeController.listStores);
router.get('/:id', idParamValidator, validate, storeController.getStore);
// Buying a new store (or deleting one) is a subscription/billing action —
// only super admin provisions/removes stores (see subscriptionRoutes.js).
// A store admin can still fully manage the store(s) they already own —
// rename it, update its address, regroup its warehouses — via PATCH below.
router.post(
  '/',
  authorize(ROLES.SUPER_ADMIN),
  createStoreValidator,
  validate,
  storeController.createStore,
);
router.patch(
  '/:id',
  requirePermission(PERMISSIONS.STORES_MANAGE),
  updateStoreValidator,
  validate,
  storeController.updateStore,
);
router.delete(
  '/:id',
  authorize(ROLES.SUPER_ADMIN),
  idParamValidator,
  validate,
  storeController.deleteStore,
);

module.exports = router;
