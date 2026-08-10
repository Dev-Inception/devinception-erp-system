const express = require('express');
const saleController = require('../controllers/saleController');
const saleReturnController = require('../controllers/saleReturnController');
const { protect } = require('../middlewares/authMiddleware');
const { requirePermission } = require('../middlewares/roleMiddleware');
const { validate } = require('../middlewares/validateMiddleware');
const { PERMISSIONS } = require('../utils/permissions');
const {
  createSaleValidator,
  updateSaleValidator,
  recordPaymentValidator,
  idParamValidator,
} = require('../validators/saleValidator');
const {
  createReturnValidator,
  listReturnsValidator,
} = require('../validators/saleReturnValidator');

const router = express.Router();
router.use(protect);

router.get('/', requirePermission(PERMISSIONS.SALES_READ), saleController.listSales);
// Must be registered before `/:id` below — otherwise Express would match
// "returns" as the :id param and never reach this handler.
router.get(
  '/returns',
  requirePermission(PERMISSIONS.SALES_READ),
  saleReturnController.listAllReturns,
);
router.get(
  '/:id',
  requirePermission(PERMISSIONS.SALES_READ),
  idParamValidator,
  validate,
  saleController.getSale,
);
router.post(
  '/',
  requirePermission(PERMISSIONS.SALES_CREATE),
  createSaleValidator,
  validate,
  saleController.createSale,
);
router.patch(
  '/:id',
  requirePermission(PERMISSIONS.SALES_UPDATE),
  updateSaleValidator,
  validate,
  saleController.updateSale,
);
router.post(
  '/:id/payments',
  requirePermission(PERMISSIONS.SALES_UPDATE),
  recordPaymentValidator,
  validate,
  saleController.recordPayment,
);
router.get(
  '/:saleId/returns',
  requirePermission(PERMISSIONS.SALES_READ),
  listReturnsValidator,
  validate,
  saleReturnController.listReturns,
);
router.post(
  '/:saleId/returns',
  requirePermission(PERMISSIONS.SALES_UPDATE),
  createReturnValidator,
  validate,
  saleReturnController.createReturn,
);

module.exports = router;
