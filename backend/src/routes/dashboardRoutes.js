const express = require("express");
const dashboardController = require("../controllers/dashboardController");
const { protect } = require("../middlewares/authMiddleware");
const { requirePermission } = require("../middlewares/roleMiddleware");
const { PERMISSIONS } = require("../utils/permissions");

const router = express.Router();
router.use(protect);

// GET /api/dashboard?warehouse=
// Headline figures + 30-day sales trend + top products for the home screen.
// Guarded by reports:read since it surfaces revenue / payables / receivables.
router.get("/", requirePermission(PERMISSIONS.REPORTS_READ), dashboardController.getSummary);

module.exports = router;
