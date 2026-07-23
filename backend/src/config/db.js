const mongoose = require('mongoose');
const env = require('./env');

/**
 * Connect to MongoDB. Resolves once the connection is open so the
 * server only starts listening after the DB is reachable.
 */
async function connectDB() {
  mongoose.set('strictQuery', true);

  const conn = await mongoose.connect(env.mongoUri);

  // eslint-disable-next-line no-console
  console.log(`MongoDB connected: ${conn.connection.host}`);
  return conn;
}

module.exports = connectDB;
