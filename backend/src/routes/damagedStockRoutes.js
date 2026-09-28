const express = require('express');
const damagedStockController = require('../controllers/damagedStockController');
const { protect } = require('../middlewares/authMiddleware');
const { requirePermission } = require('../middlewares/roleMiddleware');
const { validate } = require('../middlewares/validateMiddleware');
const { PERMISSIONS } = require('../utils/permissions');
const {
  listOutstandingValidator,
  createReturnValidator,
  listReturnsValidator,
  idParamValidator,
} = require('../validators/damagedStockValidator');

const router = express.Router();
router.use(protect);

router.get(
  '/',
  requirePermission(PERMISSIONS.DAMAGED_STOCK_READ),
  listOutstandingValidator,
  validate,
  damagedStockController.listOutstanding,
);
router.get(
  '/returns',
  requirePermission(PERMISSIONS.DAMAGED_STOCK_READ),
  listReturnsValidator,
  validate,
  damagedStockController.listReturns,
);
router.post(
  '/returns',
  requirePermission(PERMISSIONS.DAMAGED_STOCK_MANAGE),
  createReturnValidator,
  validate,
  damagedStockController.createReturn,
);
router.get(
  '/returns/:id',
  requirePermission(PERMISSIONS.DAMAGED_STOCK_READ),
  idParamValidator,
  validate,
  damagedStockController.getReturn,
);

module.exports = router;
