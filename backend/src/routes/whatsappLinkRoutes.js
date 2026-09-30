const express = require('express');
const { query } = require('express-validator');
const whatsappLinkController = require('../controllers/whatsappLinkController');
const { protect } = require('../middlewares/authMiddleware');
const { requirePermission } = require('../middlewares/roleMiddleware');
const { validate } = require('../middlewares/validateMiddleware');
const { PERMISSIONS } = require('../utils/permissions');

const router = express.Router();
router.use(protect);
// Linking hands the server a WhatsApp account — settings managers only.
router.use(requirePermission(PERMISSIONS.SETTINGS_MANAGE));

const storeQuery = [
  query('store').optional({ values: 'falsy' }).isMongoId().withMessage('Invalid store'),
  validate,
];

router.get('/', storeQuery, whatsappLinkController.getStatus);
router.post('/connect', storeQuery, whatsappLinkController.connect);
router.post('/unlink', storeQuery, whatsappLinkController.unlink);

module.exports = router;
