const express = require('express');
const { uploadSingle, uploadFile } = require('../controllers/uploadController');
const { protect } = require('../middlewares/authMiddleware');
const { requirePermission } = require('../middlewares/roleMiddleware');
const { PERMISSIONS } = require('../utils/permissions');

const router = express.Router();
router.use(protect);

// The POS uploads transfer receipts before booking an online-payment sale, so
// anyone who can ring a sale can upload. Multipart, field name `file`.
router.post('/', requirePermission(PERMISSIONS.SALES_CREATE), uploadSingle, uploadFile);

module.exports = router;
