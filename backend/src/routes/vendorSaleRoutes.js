const express = require('express');
const vendorSaleController = require('../controllers/vendorSaleController');
const { protect } = require('../middlewares/authMiddleware');
const { requirePermission } = require('../middlewares/roleMiddleware');
const { validate } = require('../middlewares/validateMiddleware');
const { PERMISSIONS } = require('../utils/permissions');
const {
  listVendorSalesValidator,
  createVendorSaleValidator,
  idParamValidator,
} = require('../validators/vendorSaleValidator');

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

module.exports = router;
