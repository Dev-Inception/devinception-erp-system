const mongoose = require('mongoose');

/**
 * Atomic, monotonic counters for human-readable document numbers
 * (e.g. SALE-2026-000010, GP-2026-0002). One document per (key, scope),
 * incremented with a single findOneAndUpdate so concurrent requests can
 * never collide on a number.
 */
const counterSchema = new mongoose.Schema({
  // e.g. "SALE", "GP", "PAY". Scoped per year so numbering resets each year.
  key: { type: String, required: true },
  scope: { type: String, required: true, default: '' },
  seq: { type: Number, default: 0 },
});

counterSchema.index({ key: 1, scope: 1 }, { unique: true });

module.exports = mongoose.model('Counter', counterSchema);
