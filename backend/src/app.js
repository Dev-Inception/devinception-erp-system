const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const swaggerUi = require('swagger-ui-express');

const routes = require('./routes');
const swaggerSpec = require('./config/swagger');
const { notFound, errorHandler } = require('./middlewares/errorMiddleware');
const env = require('./config/env');
const { UPLOAD_DIR, UPLOAD_ROUTE } = require('./config/uploads');

const app = express();

// Security headers. CSP is disabled because the bundled Swagger UI at
// /api/docs relies on inline scripts/styles that a default CSP would block;
// this service is otherwise a JSON API, so the remaining helmet defaults
// (HSTS, no-sniff, frameguard, etc.) are what we want.
app.use(helmet({ contentSecurityPolicy: false }));

// Core middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(
  cors({
    origin: env.clientUrl,
    credentials: true,
  }),
);

// Interactive API docs
app.use(
  '/api/docs',
  swaggerUi.serve,
  swaggerUi.setup(swaggerSpec, {
    customSiteTitle: 'POS API Docs',
    swaggerOptions: { persistAuthorization: true },
  }),
);
// Raw spec for tooling / import into Postman
app.get('/api/docs.json', (_req, res) => res.json(swaggerSpec));

// Uploaded files (e.g. POS transfer receipts) served as static content so the
// `url` returned by POST /api/uploads is directly retrievable.
app.use(UPLOAD_ROUTE, express.static(UPLOAD_DIR));

// API routes
app.use('/api', routes);

// 404 + centralized error handling (must be last)
app.use(notFound);
app.use(errorHandler);

module.exports = app;
