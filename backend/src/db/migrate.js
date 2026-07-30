const { QueryTypes } = require('sequelize');
const { getPostgres, closePostgres } = require('./postgres');
const migrations = require('./migrations');

const META_TABLE = 'schema_migrations';

async function ensureMetaTable(db, transaction) {
  await db.query(
    `
      CREATE TABLE IF NOT EXISTS ${META_TABLE} (
        name VARCHAR(255) PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `,
    { transaction },
  );
}

async function appliedMigrationNames(db) {
  const rows = await db.query(`SELECT name FROM ${META_TABLE} ORDER BY name`, {
    type: QueryTypes.SELECT,
  });
  return new Set(rows.map((row) => row.name));
}

async function run() {
  const db = getPostgres();
  await db.authenticate();
  await db.transaction((transaction) => ensureMetaTable(db, transaction));

  const applied = await appliedMigrationNames(db);
  if (process.argv.includes('--status')) {
    for (const migration of migrations) {
      const state = applied.has(migration.name) ? 'up' : 'pending';
      // eslint-disable-next-line no-console
      console.log(`${state.padEnd(8)} ${migration.name}`);
    }
    return;
  }

  for (const migration of migrations) {
    if (applied.has(migration.name)) continue;

    await db.transaction(async (transaction) => {
      await migration.up(db, transaction);
      await db.query(`INSERT INTO ${META_TABLE} (name) VALUES (:name)`, {
        replacements: { name: migration.name },
        transaction,
      });
    });
    // eslint-disable-next-line no-console
    console.log(`Applied ${migration.name}`);
  }
}

run()
  .catch((error) => {
    // eslint-disable-next-line no-console
    console.error('Database migration failed:', error);
    process.exitCode = 1;
  })
  .finally(closePostgres);
