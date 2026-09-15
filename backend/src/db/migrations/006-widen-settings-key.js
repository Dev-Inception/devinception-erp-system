/**
 * settingsService now reuses `key`'s existing uniqueness for per-store rows
 * by setting `key` to the store's own (24-char) id — but `key` was only
 * VARCHAR(20), sized for the original literal `'app'`. Widen it to fit.
 */
async function up(db, transaction) {
  await db.query('ALTER TABLE settings ALTER COLUMN key TYPE VARCHAR(24);', { transaction });
}

module.exports = { name: '006-widen-settings-key', up };
