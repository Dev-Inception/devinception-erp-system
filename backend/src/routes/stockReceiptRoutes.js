const express = require('express');
const stockReceiptController = require('../controllers/stockReceiptController');
const { protect } = require('../middlewares/authMiddleware');
const { requirePermission } = require('../middlewares/roleMiddleware');
const { validate } = require('../middlewares/validateMiddleware');
const { PERMISSIONS } = require('../utils/permissions');
const {
  createReceiptValidator,
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

module.exports = router;
