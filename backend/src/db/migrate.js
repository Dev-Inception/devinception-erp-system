const { getPostgres, closePostgres } = require('./postgres');
const migrations = require('./migrations');

const META_TABLE = 'schema_migrations';

async function ensureMetaTable(db) {
  await db.query(`
    CREATE TABLE IF NOT EXISTS ${META_TABLE} (
      name VARCHAR(255) PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
}

async function appliedNames(db) {
  const [rows] = await db.query(`SELECT name FROM ${META_TABLE} ORDER BY name`);
  return new Set(rows.map((row) => row.name));
}

async function printStatus() {
  const db = getPostgres();
  await ensureMetaTable(db);
  const applied = await appliedNames(db);
  for (const migration of migrations) {
    console.log(`${applied.has(migration.name) ? 'up  ' : 'pending'} ${migration.name}`);
  }
}

async function runMigrations() {
  const db = getPostgres();
  await ensureMetaTable(db);
  const applied = await appliedNames(db);

  for (const migration of migrations) {
    if (applied.has(migration.name)) continue;

    await db.transaction(async (transaction) => {
      await migration.up(db, transaction);
      await db.query(`INSERT INTO ${META_TABLE} (name) VALUES (:name)`, {
        replacements: { name: migration.name },
        transaction,
      });
    });
    console.log(`Applied ${migration.name}`);
  }
}

async function main() {
  try {
    if (process.argv.includes('--status')) {
      await printStatus();
    } else {
      await runMigrations();
    }
  } catch (err) {
    console.error('Migration failed:', err);
    process.exitCode = 1;
  } finally {
    await closePostgres();
  }
}

if (require.main === module) {
  main();
}

module.exports = { runMigrations, printStatus };
