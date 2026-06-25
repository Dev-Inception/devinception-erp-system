import { Router } from 'express';

/**
 * Root API router. Mount per-resource routers here, e.g.:
 *   import { productsRouter } from './products.routes';
 *   router.use('/products', productsRouter);
 */
export const apiRouter = Router();

// Health check so the skeleton responds out of the box.
apiRouter.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'devinception-erp-api' });
});

// TODO: mount resource routers (auth, users, products, sales, …).
