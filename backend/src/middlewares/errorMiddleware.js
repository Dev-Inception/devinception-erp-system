const ApiError = require('../utils/ApiError');
const env = require('../config/env');

// 404 handler for unmatched routes.
function notFound(req, _res, next) {
  next(ApiError.notFound(`Route not found: ${req.method} ${req.originalUrl}`));
}

// Postgres error codes that represent a client-supplied data problem rather
// than a server fault, surfaced by Sequelize as a generic SequelizeDatabaseError.
const CLIENT_ERROR_PG_CODES = new Set([
  '22P02', // invalid_text_representation (bad input for a column's type)
  '23502', // not_null_violation
  '23514', // check_violation
]);

// Central error handler. Must be the last middleware registered and keep
// all four args so Express recognizes it as an error handler.
function errorHandler(err, _req, res, _next) {
  let error = err;

  // Normalize Sequelize errors into ApiError shapes.
  if (!(error instanceof ApiError)) {
    if (error.name === 'SequelizeUniqueConstraintError') {
      const field = Object.keys(error.fields || {})[0] || error.errors?.[0]?.path || 'value';
      error = ApiError.conflict(`${field} already exists`);
    } else if (error.name === 'SequelizeValidationError') {
      const details = {};
      for (const item of error.errors) details[item.path] = item.message;
      error = ApiError.badRequest('Validation failed', details);
    } else if (error.name === 'SequelizeForeignKeyConstraintError') {
      error = ApiError.badRequest('References a record that does not exist or is still in use');
    } else if (
      error.name === 'SequelizeDatabaseError' &&
      CLIENT_ERROR_PG_CODES.has(error.parent?.code)
    ) {
      error = ApiError.badRequest(error.parent.detail || error.message);
    } else {
      error = new ApiError(error.statusCode || 500, error.message || 'Server error');
      error.isOperational = false;
    }
  }

  if (!error.isOperational || error.statusCode >= 500) {
    // eslint-disable-next-line no-console
    console.error(err);
  }

  // Field-level validation failures carry a `details` map. Expose `message` as
  // an array of the individual messages (the class-validator shape the client
  // reads as `message[0]`), while keeping the field-keyed `errors` map and a
  // human-readable string `error` for any consumer that wants the summary.
  const fieldMessages = error.details ? Object.values(error.details) : null;

  res.status(error.statusCode).json({
    success: false,
    message: fieldMessages && fieldMessages.length ? fieldMessages : error.message,
    ...(error.details ? { errors: error.details, error: error.message } : {}),
    ...(env.nodeEnv === 'development' && error.statusCode >= 500 ? { stack: err.stack } : {}),
  });
}

module.exports = { notFound, errorHandler };
