const express = require("express");
const vendorController = require("../controllers/vendorController");
const { protect } = require("../middlewares/authMiddleware");
const { requirePermission } = require("../middlewares/roleMiddleware");
const { validate } = require("../middlewares/validateMiddleware");
const { PERMISSIONS } = require("../utils/permissions");
const {
  createVendorValidator,
  updateVendorValidator,
  idParamValidator,
} = require("../validators/vendorValidator");

const router = express.Router();

// Every route here requires authentication.
router.use(protect);

router.get("/", requirePermission(PERMISSIONS.VENDORS_READ), vendorController.listVendors);
router.get(
  "/:id",
  requirePermission(PERMISSIONS.VENDORS_READ),
  idParamValidator,
  validate,
  vendorController.getVendor
);

router.post(
  "/",
  requirePermission(PERMISSIONS.VENDORS_CREATE),
  createVendorValidator,
  validate,
  vendorController.createVendor
);
router.patch(
  "/:id",
  requirePermission(PERMISSIONS.VENDORS_UPDATE),
  updateVendorValidator,
  validate,
  vendorController.updateVendor
);
router.delete(
  "/:id",
  requirePermission(PERMISSIONS.VENDORS_DELETE),
  idParamValidator,
  validate,
  vendorController.deleteVendor
);

module.exports = router;
