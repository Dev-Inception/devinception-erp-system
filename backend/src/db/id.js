const crypto = require('crypto');

// 24-char lowercase hex ids, matching MongoDB ObjectId's shape/length so
// existing route params, validators, and the frontend's id handling don't
// need to change format when the primary key moves to Postgres VARCHAR(24).
function createId() {
  return crypto.randomBytes(12).toString('hex');
}

function isValidId(value) {
  return typeof value === 'string' && /^[a-f\d]{24}$/i.test(value);
}

module.exports = { createId, isValidId };
