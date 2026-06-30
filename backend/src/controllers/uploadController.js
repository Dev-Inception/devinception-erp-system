const crypto = require('crypto');
const path = require('path');
const multer = require('multer');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const { sendSuccess } = require('../utils/ApiResponse');
const { UPLOAD_DIR, UPLOAD_ROUTE, MAX_FILE_BYTES } = require('../config/uploads');

// Disk storage with a random, collision-proof filename that keeps the original
// extension (so the served file has a sensible content type).
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname || '').slice(0, 12);
    cb(null, `${Date.now()}-${crypto.randomUUID()}${ext}`);
  },
});

// Receipts are images or PDFs; reject anything else up front.
const ALLOWED = /^(image\/(png|jpe?g|gif|webp|heic)|application\/pdf)$/i;
function fileFilter(_req, file, cb) {
  if (ALLOWED.test(file.mimetype)) return cb(null, true);
  cb(ApiError.badRequest('Only image or PDF files are allowed'));
}

const upload = multer({ storage, fileFilter, limits: { fileSize: MAX_FILE_BYTES } });

// Multer middleware wrapped so its errors (oversized file, bad type) surface as
// clean 400s through the central error handler.
function uploadSingle(req, res, next) {
  upload.single('file')(req, res, (err) => {
    if (!err) return next();
    if (err instanceof ApiError) return next(err);
    return next(ApiError.badRequest(err.message || 'Upload failed'));
  });
}

const uploadFile = asyncHandler(async (req, res) => {
  if (!req.file) throw ApiError.badRequest("A file is required (field 'file')");
  // Absolute, retrievable URL to the stored file (served as static content).
  const url = `${req.protocol}://${req.get('host')}${UPLOAD_ROUTE}/${req.file.filename}`;
  return sendSuccess(res, 201, 'File uploaded', {
    url,
    name: req.file.originalname,
    size: req.file.size,
  });
});

module.exports = { uploadSingle, uploadFile };
