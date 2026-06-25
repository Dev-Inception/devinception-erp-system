import 'dotenv/config';

/** Centralized, typed access to environment configuration. */
export const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: Number(process.env.API_PORT) || 4000,
  apiPrefix: (process.env.API_PREFIX || '/api/v1').replace(/\/$/, ''),
  corsOrigins: (process.env.CORS_ORIGIN || 'http://localhost:5173').split(','),
  mongoUri: process.env.MONGODB_URI || 'mongodb://localhost:27017/devinception_erp',
  storageDir: process.env.STORAGE_DIR || 'storage',
};
