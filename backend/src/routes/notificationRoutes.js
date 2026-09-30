const express = require('express');
const multer = require('multer');
const notificationController = require('../controllers/notificationController');
const { protect } = require('../middlewares/authMiddleware');
const { requirePermission } = require('../middlewares/roleMiddleware');
const { validate } = require('../middlewares/validateMiddleware');
const { PERMISSIONS } = require('../utils/permissions');
const ApiError = require('../utils/ApiError');
const {
  sendEmailValidator,
  sendWhatsAppValidator,
} = require('../validators/notificationValidator');

const router = express.Router();
router.use(protect);

// Gated the same as viewing the sale itself — sending its invoice doesn't
// change any data, so whoever can see a sale can send it on.
const READ = requirePermission(PERMISSIONS.SALES_READ);

// The invoice PDF for a WhatsApp send (multipart field `document`), kept in
// memory only long enough to hand it to Meta — never written to disk.
// 10 MB is far above a rendered invoice and well under WhatsApp's own limit.
const pdfUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) =>
    file.mimetype === 'application/pdf'
      ? cb(null, true)
      : cb(ApiError.badRequest('Only a PDF can be attached to a WhatsApp message')),
});
function optionalPdf(req, res, next) {
  pdfUpload.single('document')(req, res, (err) => {
    if (!err) return next();
    if (err instanceof ApiError) return next(err);
    return next(ApiError.badRequest(err.message || 'Upload failed'));
  });
}

router.post('/email', READ, sendEmailValidator, validate, notificationController.sendEmail);
router.post(
  '/whatsapp',
  READ,
  optionalPdf,
  sendWhatsAppValidator,
  validate,
  notificationController.sendWhatsApp,
);

module.exports = router;
