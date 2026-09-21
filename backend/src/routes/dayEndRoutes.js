const express = require('express');
const dayEndController = require('../controllers/dayEndController');
const { protect } = require('../middlewares/authMiddleware');
const { requirePermission } = require('../middlewares/roleMiddleware');
const { validate } = require('../middlewares/validateMiddleware');
const { PERMISSIONS } = require('../utils/permissions');
const {
  statusQueryValidator,
  openDayValidator,
  closeDayValidator,
  reopenDayValidator,
} = require('../validators/dayEndValidator');

const router = express.Router();

// Every route here requires authentication.
router.use(protect);

router.get('/', statusQueryValidator, validate, dayEndController.getStatus);

// Anyone who can see the Day Book (reports:read) can open or close a store's
// day. Reopening a closed day is more sensitive — restricted to a super
// admin or that store's own admin (enforced in dayEndService, which needs
// the store_admins scoping requirePermission alone can't express).
router.post(
  '/open',
  requirePermission(PERMISSIONS.REPORTS_READ),
  openDayValidator,
  validate,
  dayEndController.openDay,
);
router.post(
  '/close',
  requirePermission(PERMISSIONS.REPORTS_READ),
  closeDayValidator,
  validate,
  dayEndController.closeDay,
);
router.post(
  '/reopen',
  requirePermission(PERMISSIONS.REPORTS_READ),
  reopenDayValidator,
  validate,
  dayEndController.reopenDay,
);

module.exports = router;
