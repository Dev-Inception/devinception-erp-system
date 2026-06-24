const express = require("express");
const warehouseController = require("../controllers/warehouseController");
const { protect } = require("../middlewares/authMiddleware");
const { requirePermission } = require("../middlewares/roleMiddleware");
const { validate } = require("../middlewares/validateMiddleware");
const { PERMISSIONS } = require("../utils/permissions");
const {
  createWarehouseValidator,
  updateWarehouseValidator,
  idParamValidator,
} = require("../validators/warehouseValidator");

const router = express.Router();
router.use(protect);

router.get("/", requirePermission(PERMISSIONS.INVENTORY_READ), warehouseController.listWarehouses);
router.get(
  "/:id",
  requirePermission(PERMISSIONS.INVENTORY_READ),
  idParamValidator,
  validate,
  warehouseController.getWarehouse
);
router.post(
  "/",
  requirePermission(PERMISSIONS.INVENTORY_MANAGE),
  createWarehouseValidator,
  validate,
  warehouseController.createWarehouse
);
router.patch(
  "/:id",
  requirePermission(PERMISSIONS.INVENTORY_MANAGE),
  updateWarehouseValidator,
  validate,
  warehouseController.updateWarehouse
);
router.delete(
  "/:id",
  requirePermission(PERMISSIONS.INVENTORY_MANAGE),
  idParamValidator,
  validate,
  warehouseController.deleteWarehouse
);

module.exports = router;
