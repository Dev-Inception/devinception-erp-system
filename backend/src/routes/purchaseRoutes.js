const express = require('express');
const purchaseController = require('../controllers/purchaseController');
const { protect } = require('../middlewares/authMiddleware');
const { requirePermission } = require('../middlewares/roleMiddleware');
const { validate } = require('../middlewares/validateMiddleware');
const { PERMISSIONS } = require('../utils/permissions');
const { createPurchaseValidator, idParamValidator } = require('../validators/purchaseValidator');

const router = express.Router();
router.use(protect);

router.get('/', requirePermission(PERMISSIONS.PURCHASES_READ), purchaseController.listPurchases);
router.get(
  '/:id',
  requirePermission(PERMISSIONS.PURCHASES_READ),
  idParamValidator,
  validate,
  purchaseController.getPurchase,
);
router.post(
  '/',
  requirePermission(PERMISSIONS.PURCHASES_CREATE),
  createPurchaseValidator,
  validate,
  purchaseController.createPurchase,
);

module.exports = router;
