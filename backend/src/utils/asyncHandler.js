/**
 * Wraps an async route handler so any thrown/rejected error is forwarded
 * to Express's error middleware instead of crashing the process.
 *
 *   router.post("/login", asyncHandler(authController.login));
 */
const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

module.exports = asyncHandler;
