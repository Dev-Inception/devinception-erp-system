const express = require('express');
const stockReceiptController = require('../controllers/stockReceiptController');
const { protect } = require('../middlewares/authMiddleware');
const { requirePermission } = require('../middlewares/roleMiddleware');
const { validate } = require('../middlewares/validateMiddleware');
const { PERMISSIONS } = require('../utils/permissions');
const {
  createReceiptValidator,
  updateReceiptValidator,
  idParamValidator,
  listReceiptsValidator,
} = require('../validators/stockReceiptValidator');

const router = express.Router();
router.use(protect);

router.get(
  '/',
  requirePermission(PERMISSIONS.INVENTORY_READ),
  listReceiptsValidator,
  validate,
  stockReceiptController.listReceipts,
);
router.post(
  '/',
  requirePermission(PERMISSIONS.INVENTORY_MANAGE),
  createReceiptValidator,
  validate,
  stockReceiptController.createReceipt,
);
router.patch(
  '/:id',
  requirePermission(PERMISSIONS.INVENTORY_MANAGE),
  updateReceiptValidator,
  validate,
  stockReceiptController.updateReceipt,
);
router.delete(
  '/:id',
  requirePermission(PERMISSIONS.INVENTORY_MANAGE),
  idParamValidator,
  validate,
  stockReceiptController.deleteReceipt,
);

module.exports = router;
