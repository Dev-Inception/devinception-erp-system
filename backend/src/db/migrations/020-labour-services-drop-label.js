/**
 * Labour Services turned out to only need Name + Description — drops the
 * `label` column added in 019-labour-services.js before anyone started
 * relying on it.
 */
async function up(db, transaction) {
  await db.query(`ALTER TABLE labour_services DROP COLUMN label;`, { transaction });
}

module.exports = { name: '020-labour-services-drop-label', up };
