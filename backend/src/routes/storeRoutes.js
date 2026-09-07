const express = require('express');
const storeController = require('../controllers/storeController');
const { protect } = require('../middlewares/authMiddleware');
const { requirePermission } = require('../middlewares/roleMiddleware');
const { validate } = require('../middlewares/validateMiddleware');
const { PERMISSIONS } = require('../utils/permissions');
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
router.post(
  '/',
  requirePermission(PERMISSIONS.STORES_MANAGE),
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
  requirePermission(PERMISSIONS.STORES_MANAGE),
  idParamValidator,
  validate,
  storeController.deleteStore,
);

module.exports = router;
