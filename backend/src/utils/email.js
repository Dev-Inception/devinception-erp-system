/**
 * Email handling. Addresses are stored exactly as typed apart from trimming
 * and lowercasing — dots and "+tags" are part of the address the user owns.
 *
 * Validators used to run express-validator's normalizeEmail(), which by
 * default rewrites Gmail addresses (drops dots and anything after "+", maps
 * googlemail.com to gmail.com), so "first.last@gmail.com" was saved as
 * "firstlast@gmail.com". `emailCandidates` lets lookups by login email still
 * find an account saved in that old form.
 */

const cleanEmail = (value) =>
  String(value ?? '')
    .trim()
    .toLowerCase();

// What the old normalizeEmail() default would have stored for `email`
// (only Gmail addresses were rewritten).
function legacyNormalizedEmail(email) {
  const clean = cleanEmail(email);
  const at = clean.lastIndexOf('@');
  if (at < 0) return clean;
  const domain = clean.slice(at + 1);
  if (domain !== 'gmail.com' && domain !== 'googlemail.com') return clean;
  const local = clean.slice(0, at).split('+')[0].replace(/\./g, '');
  return `${local}@gmail.com`;
}

// Every stored form an account with this login email could be under —
// exact first, then the legacy normalized one.
function emailCandidates(email) {
  return Array.from(new Set([cleanEmail(email), legacyNormalizedEmail(email)]));
}

module.exports = { cleanEmail, legacyNormalizedEmail, emailCandidates };
