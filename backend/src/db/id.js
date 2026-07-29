const crypto = require('crypto');

// Keep the existing 24-character hexadecimal ID contract. Existing Mongo
// ObjectIds can be imported unchanged, while new PostgreSQL rows receive IDs
// with the same externally-visible format.
function createId() {
  return crypto.randomBytes(12).toString('hex');
}

function isValidId(value) {
  return typeof value === 'string' && /^[a-f\d]{24}$/i.test(value);
}

module.exports = { createId, isValidId };
