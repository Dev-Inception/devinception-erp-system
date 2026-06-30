const express = require('express');
const settingsController = require('../controllers/settingsController');
const { protect } = require('../middlewares/authMiddleware');
const { requirePermission } = require('../middlewares/roleMiddleware');
const { validate } = require('../middlewares/validateMiddleware');
const { PERMISSIONS } = require('../utils/permissions');
const { updateSettingsValidator } = require('../validators/settingsValidator');

const router = express.Router();
router.use(protect);

// Any authenticated user can read settings (company info appears on receipts /
// invoices across every screen); only settings managers can change them.
router.get('/', settingsController.getSettings);
router.put(
  '/',
  requirePermission(PERMISSIONS.SETTINGS_MANAGE),
  updateSettingsValidator,
  validate,
  settingsController.updateSettings,
);

module.exports = router;
