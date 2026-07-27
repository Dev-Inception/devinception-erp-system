const ApiError = require('./ApiError');

// This ERP tracks discrete pieces only. Quantity values must remain safe
// integers at every boundary; monetary averages may still be fractional.

function normalizeQuantity(value) {
  const validType = typeof value === 'number' || typeof value === 'string';
  if (!validType || (typeof value === 'string' && value.trim() === '')) return Number.NaN;
  const quantity = Number(value);
  return Number.isSafeInteger(quantity) ? quantity : Number.NaN;
}

function requirePositiveQuantity(value, message = 'Quantity must be positive') {
  const quantity = normalizeQuantity(value);
  if (!(quantity > 0)) throw ApiError.badRequest(message);
  return quantity;
}

function requireNonZeroQuantity(value, message = 'Quantity cannot be zero') {
  const quantity = normalizeQuantity(value);
  if (!Number.isFinite(quantity) || quantity === 0) throw ApiError.badRequest(message);
  return quantity;
}

module.exports = {
  normalizeQuantity,
  requirePositiveQuantity,
  requireNonZeroQuantity,
};
