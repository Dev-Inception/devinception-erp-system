const { Sequelize } = require('sequelize');
const pg = require('pg');
const env = require('../config/env');

let sequelize;

// The application deliberately stores money as integer paisa and quantities
// as fixed-scale decimals. pg returns BIGINT/NUMERIC as strings by default;
// converting them here preserves the numeric API contract used today.
pg.types.setTypeParser(pg.types.builtins.INT8, (value) => Number(value));
pg.types.setTypeParser(pg.types.builtins.NUMERIC, (value) => Number(value));

function getPostgres() {
  if (!env.databaseUrl) {
    throw new Error('DATABASE_URL is required for PostgreSQL commands');
  }

  if (!sequelize) {
    const logging =
      env.nodeEnv === 'development' && process.env.SQL_LOG === 'true'
        ? (message) => process.stdout.write(`${message}\n`)
        : false;

    sequelize = new Sequelize(env.databaseUrl, {
      dialect: 'postgres',
      logging,
      dialectOptions: env.databaseSsl
        ? {
            ssl: {
              require: true,
              rejectUnauthorized: false,
            },
          }
        : {},
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
