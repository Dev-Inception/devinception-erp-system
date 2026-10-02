const express = require('express');
const dayEndController = require('../controllers/dayEndController');
const { protect } = require('../middlewares/authMiddleware');
const { validate } = require('../middlewares/validateMiddleware');
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

// Every user can open or close the day for a store they have access to
// (checked in dayEndService). Opening a past date and reopening a closed
// day are more sensitive — restricted to a super admin or that store's own
// admin (also enforced in dayEndService, which needs the store_admins
// scoping requirePermission alone can't express).
router.post('/open', openDayValidator, validate, dayEndController.openDay);
router.post('/close', closeDayValidator, validate, dayEndController.closeDay);
router.post('/reopen', reopenDayValidator, validate, dayEndController.reopenDay);

module.exports = router;
