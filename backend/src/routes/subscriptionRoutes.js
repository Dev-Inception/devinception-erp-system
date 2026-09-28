const express = require('express');
const subscriptionController = require('../controllers/subscriptionController');
const { protect } = require('../middlewares/authMiddleware');
const { requirePermission } = require('../middlewares/roleMiddleware');
const { validate } = require('../middlewares/validateMiddleware');
const { PERMISSIONS } = require('../utils/permissions');
const {
  provisionValidator,
  addStoreValidator,
  attachExistingStoreValidator,
  updateSubscriptionValidator,
} = require('../validators/subscriptionValidator');

const router = express.Router();

// Superadmin-only: selling/managing stores is not part of any tenant's own
// operations, so every route here requires the wildcard-only permission.
router.use(protect, requirePermission(PERMISSIONS.SUBSCRIPTIONS_MANAGE));

router.get('/', subscriptionController.listSubscriptions);
router.get('/owners', subscriptionController.listOwners);
router.post('/provision', provisionValidator, validate, subscriptionController.provision);
router.post(
  '/owners/:ownerId/stores',
  addStoreValidator,
  validate,
  subscriptionController.addStoreToOwner,
);
router.post(
  '/owners/:ownerId/attach-existing-store',
  attachExistingStoreValidator,
  validate,
  subscriptionController.attachExistingStore,
);
router.patch(
  '/:id',
  updateSubscriptionValidator,
  validate,
  subscriptionController.updateSubscription,
);

module.exports = router;
