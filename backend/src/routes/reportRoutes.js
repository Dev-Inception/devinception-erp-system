const express = require('express');
const reportController = require('../controllers/reportController');
const { protect } = require('../middlewares/authMiddleware');
const { requirePermission } = require('../middlewares/roleMiddleware');
const { validate } = require('../middlewares/validateMiddleware');
const { PERMISSIONS } = require('../utils/permissions');
const { reportRequestValidator } = require('../validators/reportValidator');
const { param } = require('express-validator');

const router = express.Router();
router.use(protect);

// One Day Book entry in full (the row click-through modal). Three path
// segments, so it can't collide with /:type or /:type/csv below.
router.get(
  '/day-book/entries/:id',
  requirePermission(PERMISSIONS.REPORTS_READ),
  param('id').isMongoId().withMessage('Invalid entry id'),
  validate,
  reportController.getDayBookEntry,
);

// GET /api/reports/:type?from=&to=&warehouse=
// type: sales | purchases | stock-valuation | profit-loss
router.get(
  '/:type/csv',
  requirePermission(PERMISSIONS.REPORTS_READ),
  reportRequestValidator,
  validate,
  reportController.downloadReportCsv,
);
router.get(
  '/:type',
  requirePermission(PERMISSIONS.REPORTS_READ),
  reportRequestValidator,
  validate,
  reportController.getReport,
);

module.exports = router;
