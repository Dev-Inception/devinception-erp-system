import express from 'express';
import cors from 'cors';
import { env } from './config/env';
import { apiRouter } from './routes';
import { errorHandler } from './middleware/error';

/** Build the Express application (no listening — see server.ts). */
export function createApp() {
  const app = express();

  app.use(cors({ origin: env.corsOrigins, credentials: true }));
  app.use(express.json());

  // Serve uploaded files (logos, receipts, …) statically.
  app.use('/uploads', express.static(env.storageDir));

  app.use(env.apiPrefix, apiRouter);

  app.use(errorHandler);
  return app;
}
