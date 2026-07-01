const path = require('path');
const fs = require('fs');

/**
 * Where uploaded files (e.g. POS transfer receipts) are stored on disk, and the
 * public path prefix they are served under. The directory is created on first
 * import so the upload handler and the static file server agree and never write
 * to a missing folder.
 */
const UPLOAD_DIR = path.join(__dirname, '..', '..', 'uploads');
const UPLOAD_ROUTE = '/uploads';
const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB

fs.mkdirSync(UPLOAD_DIR, { recursive: true });

module.exports = { UPLOAD_DIR, UPLOAD_ROUTE, MAX_FILE_BYTES };
