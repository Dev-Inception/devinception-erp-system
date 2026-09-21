const express = require('express');
const vendorSaleController = require('../controllers/vendorSaleController');
const vendorSaleReturnController = require('../controllers/vendorSaleReturnController');
const { protect } = require('../middlewares/authMiddleware');
const { requirePermission } = require('../middlewares/roleMiddleware');
const { validate } = require('../middlewares/validateMiddleware');
const { PERMISSIONS } = require('../utils/permissions');
const {
  listVendorSalesValidator,
  createVendorSaleValidator,
  updateVendorSaleValidator,
  idParamValidator,
} = require('../validators/vendorSaleValidator');
const {
  createVendorSaleReturnValidator,
  listVendorSaleReturnsValidator,
} = require('../validators/vendorSaleReturnValidator');

const router = express.Router();
router.use(protect);

router.get(
  '/',
  requirePermission(PERMISSIONS.VENDOR_SALES_READ),
  listVendorSalesValidator,
  validate,
  vendorSaleController.listVendorSales,
);
router.post(
  '/',
  requirePermission(PERMISSIONS.VENDOR_SALES_MANAGE),
  createVendorSaleValidator,
  validate,
  vendorSaleController.createVendorSale,
);
router.get(
  '/:id',
  requirePermission(PERMISSIONS.VENDOR_SALES_READ),
  idParamValidator,
  validate,
  vendorSaleController.getVendorSale,
);
router.patch(
  '/:id',
  requirePermission(PERMISSIONS.VENDOR_SALES_MANAGE),
  updateVendorSaleValidator,
  validate,
  vendorSaleController.updateVendorSale,
);
router.get(
  '/:vendorSaleId/returns',
  requirePermission(PERMISSIONS.VENDOR_SALES_READ),
  listVendorSaleReturnsValidator,
  validate,
  vendorSaleReturnController.listReturns,
);
router.post(
  '/:vendorSaleId/returns',
  requirePermission(PERMISSIONS.VENDOR_SALES_MANAGE),
  createVendorSaleReturnValidator,
  validate,
  vendorSaleReturnController.createReturn,
);

module.exports = router;
