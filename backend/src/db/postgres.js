const { Sequelize, DataTypes } = require('sequelize');
const pg = require('pg');
const env = require('../config/env');

// Money is integer paisa (BIGINT) and quantities are fixed-scale decimals
// (NUMERIC). node-postgres returns both as strings by default to avoid
// silent precision loss; the app already treats them as JS numbers
// everywhere, so coerce them back globally right here instead of at every
// call site.
pg.types.setTypeParser(pg.types.builtins.INT8, (value) => Number(value));
pg.types.setTypeParser(pg.types.builtins.NUMERIC, (value) => Number(value));

// Sequelize's postgres dialect keeps its own OID->parser map per connection
// (see dialects/postgres/connection-manager.js) instead of consulting the
// global `pg.types` registry above, and its DECIMAL type's `parse` normally
// just returns the raw string — this is the actual hook that needs
// overriding for NUMERIC/DECIMAL columns to come back as JS numbers.
DataTypes.postgres.DECIMAL.parse = (value) => (value === null ? null : Number(value));

let sequelize;

function getPostgres() {
  if (!env.databaseUrl) throw new Error('DATABASE_URL is required for PostgreSQL commands');

  if (!sequelize) {
    const logging =
      env.nodeEnv === 'development' && process.env.SQL_LOG === 'true'
        ? (message) => process.stdout.write(`${message}\n`)
        : false;

    sequelize = new Sequelize(env.databaseUrl, {
      dialect: 'postgres',
      logging,
      dialectOptions: env.databaseSsl ? { ssl: { require: true, rejectUnauthorized: false } } : {},
      pool: {
        max: parseInt(process.env.DATABASE_POOL_MAX, 10) || 10,
        min: 0,
        acquire: 30000,
        idle: 10000,
      },
    });
  }
  return sequelize;
}

async function closePostgres() {
  if (!sequelize) return;
  await sequelize.close();
  sequelize = undefined;
}

module.exports = { getPostgres, closePostgres };
