const { validationResult } = require('express-validator');
const ApiError = require('../utils/ApiError');

/**
 * Runs after a list of express-validator checks and turns any failures
 * into a single 400 with a field-keyed details object.
 */
function validate(req, _res, next) {
  const result = validationResult(req);
  if (result.isEmpty()) return next();

  const details = {};
  for (const err of result.array()) {
    if (!details[err.path]) details[err.path] = err.msg;
  }

  return next(ApiError.badRequest('Validation failed', details));
}

module.exports = { validate };
