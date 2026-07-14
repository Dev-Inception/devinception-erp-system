const ApiError = require('./ApiError');

// Quantities support weights/fractions while remaining deterministic in Mongo
// Number fields. Six decimal places cover common inventory units and prevent
// repeated binary-float operations (such as 0.1 issues) leaving tiny residues.
const QUANTITY_DECIMALS = 6;
const QUANTITY_FACTOR = 10 ** QUANTITY_DECIMALS;

function normalizeQuantity(value) {
  const validType = typeof value === 'number' || typeof value === 'string';
  if (!validType || (typeof value === 'string' && value.trim() === '')) return Number.NaN;
  const quantity = Number(value);
  if (!Number.isFinite(quantity)) return Number.NaN;
  const scaled = Math.round(quantity * QUANTITY_FACTOR);
  if (!Number.isSafeInteger(scaled)) return Number.NaN;
  return scaled / QUANTITY_FACTOR;
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
  QUANTITY_DECIMALS,
  normalizeQuantity,
  requirePositiveQuantity,
  requireNonZeroQuantity,
};
