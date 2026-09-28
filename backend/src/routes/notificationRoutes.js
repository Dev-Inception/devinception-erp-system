const express = require('express');
const notificationController = require('../controllers/notificationController');
const { protect } = require('../middlewares/authMiddleware');
const { requirePermission } = require('../middlewares/roleMiddleware');
const { validate } = require('../middlewares/validateMiddleware');
const { PERMISSIONS } = require('../utils/permissions');
const {
  sendEmailValidator,
  sendWhatsAppValidator,
} = require('../validators/notificationValidator');

const router = express.Router();
router.use(protect);

// Gated the same as viewing the sale itself — sending its invoice doesn't
// change any data, so whoever can see a sale can send it on.
const READ = requirePermission(PERMISSIONS.SALES_READ);

router.post('/email', READ, sendEmailValidator, validate, notificationController.sendEmail);
router.post(
  '/whatsapp',
  READ,
  sendWhatsAppValidator,
  validate,
  notificationController.sendWhatsApp,
);

module.exports = router;
