const { getPostgres } = require('../db/postgres');

/**
 * Verify PostgreSQL before the HTTP server starts. Schema changes remain an
 * explicit deployment step (`npm run db:migrate`) rather than implicit sync.
 */
async function connectDB() {
  const db = getPostgres();
  await db.authenticate();
  // eslint-disable-next-line no-console
  console.log('PostgreSQL connected');
  return db;
}

module.exports = connectDB;
