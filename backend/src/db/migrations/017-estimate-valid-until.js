/**
 * Adds an optional expiry date to estimates — "this quote is valid until
 * <date>" — so a stale quote can be told apart from a live one.
 */
async function up(db, transaction) {
  await db.query(`ALTER TABLE estimates ADD COLUMN valid_until TIMESTAMPTZ;`, { transaction });
}

module.exports = { name: '017-estimate-valid-until', up };
