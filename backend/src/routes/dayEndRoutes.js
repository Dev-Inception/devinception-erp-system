const express = require('express');
const dayEndController = require('../controllers/dayEndController');
const { protect } = require('../middlewares/authMiddleware');
const { authorize, requireMinRole } = require('../middlewares/roleMiddleware');
const { validate } = require('../middlewares/validateMiddleware');
const { ROLES } = require('../utils/constants');
const {
  statusQueryValidator,
  closeDayValidator,
  reopenDayValidator,
} = require('../validators/dayEndValidator');

const router = express.Router();

// Every route here requires authentication.
router.use(protect);

router.get('/', statusQueryValidator, validate, dayEndController.getStatus);

// A manager (or above) can close a store's day; only a super admin can
// reopen one, or add sales after it's closed (see saleService.createSale).
router.post(
  '/close',
  requireMinRole(ROLES.MANAGER),
  closeDayValidator,
  validate,
  dayEndController.closeDay,
);
router.post(
  '/reopen',
  authorize(ROLES.SUPER_ADMIN),
  reopenDayValidator,
  validate,
  dayEndController.reopenDay,
);

module.exports = router;
