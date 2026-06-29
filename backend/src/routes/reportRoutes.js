const express = require("express");
const reportController = require("../controllers/reportController");
const { protect } = require("../middlewares/authMiddleware");
const { requirePermission } = require("../middlewares/roleMiddleware");
const { PERMISSIONS } = require("../utils/permissions");

const router = express.Router();
router.use(protect);

// GET /api/reports/:type?from=&to=&warehouse=
// type: sales | purchases | stock-valuation | profit-loss
router.get("/:type", requirePermission(PERMISSIONS.REPORTS_READ), reportController.getReport);

module.exports = router;
