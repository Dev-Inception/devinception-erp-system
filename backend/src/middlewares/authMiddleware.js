const User = require('../models/userModel');
const ApiError = require('../utils/ApiError');
const asyncHandler = require('../utils/asyncHandler');
const tokenService = require('../services/tokenService');

/**
 * Authenticate the request. Reads a Bearer access token, verifies it,
 * loads the user, and attaches it to req.user. Anything missing or
 * invalid results in 401.
 */
const protect = asyncHandler(async (req, _res, next) => {
  let token;
  const header = req.headers.authorization;
  if (header && header.startsWith('Bearer ')) {
    token = header.split(' ')[1];
  } else if (req.cookies && req.cookies.accessToken) {
    token = req.cookies.accessToken;
  }

  if (!token) {
    throw ApiError.unauthorized('Authentication token is missing');
  }

  let payload;
  try {
    payload = tokenService.verifyAccessToken(token);
  } catch {
    throw ApiError.unauthorized('Invalid or expired token');
  }

  const user = await User.findById(payload.sub).select('+passwordChangedAt');
  if (!user) {
    throw ApiError.unauthorized('User belonging to this token no longer exists');
  }
  if (!user.isActive) {
    throw ApiError.forbidden('Account is deactivated');
  }
  if (user.passwordChangedAfter(payload.iat)) {
    throw ApiError.unauthorized('Password changed, please log in again');
  }

  req.user = user;
  next();
});

module.exports = { protect };
