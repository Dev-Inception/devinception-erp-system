/**
 * Money helpers. All monetary amounts are stored as integer **paisa**
 * (1 rupee = 100 paisa) to avoid floating-point drift; rupees are only ever
 * used at the API boundary. Convert on the way in, convert on the way out,
 * and keep every internal calculation in integer paisa.
 *
 * See: https://www.moderntreasury.com/journal/floats-dont-work-for-storing-cents
 */

const ApiError = require('./ApiError');

// Rupees (number, possibly with decimals) -> integer paisa. Throws on a
// non-finite/garbage amount rather than silently coercing it to 0, which would
// quietly drop money (e.g. a malformed opening balance posting as zero).
function toPaisa(rupees) {
  const n = Number(rupees);
  if (!Number.isFinite(n)) {
    throw ApiError.badRequest('Invalid monetary amount');
  }
  // Round to the nearest paisa to absorb float representation error.
  return Math.round(n * 100);
}

// Integer paisa -> rupees (number). Used when serializing for the client.
function toRupees(paisa) {
  return Math.round(Number(paisa) || 0) / 100;
}

/**
 * Return a shallow copy of `obj` with the named (paisa) fields converted to
 * rupees for the API response. Explicit field lists avoid converting
 * count-like fields that happen to share a name (e.g. pagination `total`).
 */
function view(obj, keys) {
  if (!obj) return obj;
  const out = { ...obj };
  for (const k of keys) {
    if (typeof out[k] === 'number') out[k] = toRupees(out[k]);
  }
  return out;
}

module.exports = { toPaisa, toRupees, view };
