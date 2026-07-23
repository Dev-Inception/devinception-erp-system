const ApiError = require('../utils/ApiError');
const { toPaisa } = require('../utils/money');
const { requirePositiveQuantity } = require('../utils/quantity');

// An omitted price uses the catalog default (already stored in paisa). An
// explicit override must be a real numeric value; do not let null/blank/boolean
// form values silently become a zero-priced line through Number coercion.
function resolveUnitPrice(value, catalogPrice) {
  if (value === undefined) return catalogPrice;
  const validType = typeof value === 'number' || typeof value === 'string';
  if (!validType || (typeof value === 'string' && value.trim() === '')) {
    throw ApiError.badRequest('Item unit price must be a non-negative monetary amount');
  }
  return toPaisa(value);
}

/**
 * Calculate authoritative invoice totals in integer paisa. Callers provide
 * resolved line prices in paisa; no subtotal, tax, or total supplied by an API
 * client is ever used. The invoice-level discount is applied before tax:
 *
 *   subtotal - discount = taxableAmount
 *   taxableAmount * taxPercent = tax
 *   taxableAmount + tax = grandTotal
 */
function calculateInvoiceTotals(items, { discount = 0, taxPercent = 0 } = {}) {
  if (!Array.isArray(items) || items.length === 0) {
    throw ApiError.badRequest('At least one item is required');
  }

  let subtotal = 0;
  const lines = items.map((item) => {
    const quantity = requirePositiveQuantity(item.quantity, 'Item quantity must be positive');
    const unitPrice = Number(item.unitPrice);

    if (!Number.isSafeInteger(unitPrice) || unitPrice < 0) {
      throw ApiError.badRequest('Item unit price must be a non-negative monetary amount');
    }

    const lineTotal = Math.round(quantity * unitPrice);
    if (!Number.isSafeInteger(lineTotal)) {
      throw ApiError.badRequest('Invoice line amount is too large');
    }
    subtotal += lineTotal;
    return { ...item, quantity, unitPrice, lineTotal };
  });

  if (!Number.isSafeInteger(subtotal)) {
    throw ApiError.badRequest('Invoice subtotal is too large');
  }

  const discountPaisa = toPaisa(discount);
  if (discountPaisa < 0) throw ApiError.badRequest('Discount must be non-negative');
  if (discountPaisa > subtotal) throw ApiError.badRequest('Discount cannot exceed the subtotal');

  const taxPct = Number(taxPercent);
  if (!Number.isFinite(taxPct) || taxPct < 0 || taxPct > 100) {
    throw ApiError.badRequest('Tax % must be 0–100');
  }

  const taxableAmount = subtotal - discountPaisa;
  const tax = Math.round((taxableAmount * taxPct) / 100);
  const grandTotal = taxableAmount + tax;
  if (!Number.isSafeInteger(tax) || !Number.isSafeInteger(grandTotal)) {
    throw ApiError.badRequest('Invoice total is too large');
  }

  return {
    items: lines,
    subtotal,
    discount: discountPaisa,
    taxableAmount,
    taxPercent: taxPct,
    tax,
    grandTotal,
    // Keep `total` as the persisted-model field while exposing the explicit
    // business term to calculation consumers and tests.
    total: grandTotal,
  };
}

module.exports = { calculateInvoiceTotals, resolveUnitPrice };
