const crypto = require('crypto');

// Public PostgreSQL records use compact, URL-safe 24-character hexadecimal IDs.
function createId() {
  return crypto.randomBytes(12).toString('hex');
}

function isValidId(value) {
  return typeof value === 'string' && /^[a-f\d]{24}$/i.test(value);
}

module.exports = { createId, isValidId };
