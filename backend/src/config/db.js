const { getPostgres } = require('../db/postgres');

/**
 * Connect to PostgreSQL. Resolves once the connection is verified so the
 * server only starts listening after the DB is reachable. Schema changes
 * only ever happen through explicit migrations (src/db/migrate.js) — this
 * never calls sync().
 */
async function connectDB() {
  const db = getPostgres();
  await db.authenticate();

  // eslint-disable-next-line no-console
  console.log('PostgreSQL connected');
  return db;
}

module.exports = connectDB;
