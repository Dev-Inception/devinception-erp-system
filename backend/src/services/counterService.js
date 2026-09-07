const { QueryTypes } = require('sequelize');
const { getPostgres } = require('../db/postgres');

/**
 * Returns the next sequence number for a key within a scope, atomically.
 * `INSERT ... ON CONFLICT ... DO UPDATE ... RETURNING` guarantees each caller
 * gets a unique, gap-free-per-scope value even under concurrency. Must run
 * inside the caller's transaction so the number rolls back with everything
 * else on failure.
 */
async function nextSeq(key, scope = '', transaction) {
  const [row] = await getPostgres().query(
    `INSERT INTO counters (key, scope, seq)
     VALUES (:key, :scope, 1)
     ON CONFLICT (key, scope) DO UPDATE SET seq = counters.seq + 1
     RETURNING seq`,
    { replacements: { key, scope }, transaction, type: QueryTypes.SELECT },
  );
  return Number(row.seq);
}

/**
 * Builds a formatted document number like `SALE-2026-000010`.
 *   prefix: "SALE", year: 2026, width: 6  ->  SALE-2026-000010
 * Numbering is scoped per year so it resets each January.
 */
async function nextDocNumber(prefix, year, width = 4, transaction) {
  const seq = await nextSeq(prefix, String(year), transaction);
  return `${prefix}-${year}-${String(seq).padStart(width, '0')}`;
}

module.exports = { nextSeq, nextDocNumber };
