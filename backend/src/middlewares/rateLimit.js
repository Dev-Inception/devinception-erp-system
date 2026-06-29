const rateLimit = require("express-rate-limit");

/**
 * Rate limiters for abuse-prone endpoints. Login/password flows are the prime
 * targets for credential brute force and email flooding, so they get a tight
 * per-IP cap. Responses use the standard `RateLimit-*` headers; the body is the
 * usual JSON error shape so the client handles it like any other 4xx.
 */

const message = (msg) => ({ success: false, message: msg });

// Login: a handful of attempts per window, then back off. Successful logins are
// not counted against the limit so a legitimate user isn't locked out.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: 10,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: message("Too many login attempts. Please try again later."),
});

// Forgot/reset password: very tight, since each request can trigger an email.
const passwordResetLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  limit: 5,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: message("Too many password reset requests. Please try again later."),
});

module.exports = { loginLimiter, passwordResetLimiter };
