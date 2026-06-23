const ApiError = require("../utils/ApiError");
const env = require("../config/env");

// 404 handler for unmatched routes.
function notFound(req, _res, next) {
  next(ApiError.notFound(`Route not found: ${req.method} ${req.originalUrl}`));
}

// Central error handler. Must be the last middleware registered and keep
// all four args so Express recognizes it as an error handler.
// eslint-disable-next-line no-unused-vars
function errorHandler(err, _req, res, _next) {
  let error = err;

  // Normalize common non-ApiError errors into ApiError shapes.
  if (!(error instanceof ApiError)) {
    if (error.name === "ValidationError") {
      const details = {};
      for (const key of Object.keys(error.errors)) {
        details[key] = error.errors[key].message;
      }
      error = ApiError.badRequest("Validation failed", details);
    } else if (error.code === 11000) {
      const field = Object.keys(error.keyValue || { field: "" })[0];
      error = ApiError.conflict(`${field} already exists`);
    } else if (error.name === "CastError") {
      error = ApiError.badRequest(`Invalid ${error.path}: ${error.value}`);
    } else {
      error = new ApiError(error.statusCode || 500, error.message || "Server error");
      error.isOperational = false;
    }
  }

  if (!error.isOperational || error.statusCode >= 500) {
    // eslint-disable-next-line no-console
    console.error(err);
  }

  res.status(error.statusCode).json({
    success: false,
    message: error.message,
    ...(error.details ? { errors: error.details } : {}),
    ...(env.nodeEnv === "development" && error.statusCode >= 500
      ? { stack: err.stack }
      : {}),
  });
}

module.exports = { notFound, errorHandler };
