const ApiError = require('../utils/ApiError');
const env = require('../config/env');

// 404 handler for unmatched routes.
function notFound(req, _res, next) {
  next(ApiError.notFound(`Route not found: ${req.method} ${req.originalUrl}`));
}

// Central error handler. Must be the last middleware registered and keep
// all four args so Express recognizes it as an error handler.
function errorHandler(err, _req, res, _next) {
  let error = err;

  // Normalize common non-ApiError errors into ApiError shapes.
  if (!(error instanceof ApiError)) {
    if (error.name === 'ValidationError') {
      const details = {};
      for (const key of Object.keys(error.errors)) {
        details[key] = error.errors[key].message;
      }
      error = ApiError.badRequest('Validation failed', details);
    } else if (error.code === 11000) {
      const field = Object.keys(error.keyValue || { field: '' })[0];
      error = ApiError.conflict(`${field} already exists`);
    } else if (error.name === 'CastError') {
      error = ApiError.badRequest(`Invalid ${error.path}: ${error.value}`);
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
