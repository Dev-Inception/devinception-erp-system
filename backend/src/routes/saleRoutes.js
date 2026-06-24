const express = require("express");
const saleController = require("../controllers/saleController");
const { protect } = require("../middlewares/authMiddleware");
const { requirePermission } = require("../middlewares/roleMiddleware");
const { validate } = require("../middlewares/validateMiddleware");
const { PERMISSIONS } = require("../utils/permissions");
const { createSaleValidator, idParamValidator } = require("../validators/saleValidator");

const router = express.Router();
router.use(protect);

router.get("/", requirePermission(PERMISSIONS.SALES_READ), saleController.listSales);
router.get(
  "/:id",
  requirePermission(PERMISSIONS.SALES_READ),
  idParamValidator,
  validate,
  saleController.getSale
);
router.post(
  "/",
  requirePermission(PERMISSIONS.SALES_CREATE),
  createSaleValidator,
  validate,
  saleController.createSale
);

module.exports = router;
