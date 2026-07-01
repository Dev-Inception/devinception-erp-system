const Counter = require('../models/counterModel');

/**
 * Returns the next sequence number for a key within a scope, atomically.
 * The $inc + upsert + "after" return guarantees each caller gets a unique,
 * gap-free-per-scope value even under concurrency.
 */
async function nextSeq(key, scope = '') {
  const doc = await Counter.findOneAndUpdate(
    { key, scope },
    { $inc: { seq: 1 } },
    { returnDocument: 'after', upsert: true },
  );
  return doc.seq;
}

/**
 * Builds a formatted document number like `SALE-2026-000010`.
 *   prefix: "SALE", year: 2026, width: 6  ->  SALE-2026-000010
 * Numbering is scoped per year so it resets each January.
 */
async function nextDocNumber(prefix, year, width = 4) {
  const seq = await nextSeq(prefix, String(year));
  return `${prefix}-${year}-${String(seq).padStart(width, '0')}`;
}

module.exports = { nextSeq, nextDocNumber };
