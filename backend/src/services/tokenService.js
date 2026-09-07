const jwt = require('jsonwebtoken');
const env = require('../config/env');

/**
 * JWT helpers. Access tokens are short-lived and sent in the response /
 * Authorization header; refresh tokens are long-lived and used to mint
 * new access tokens.
 */
function signAccessToken(user) {
  return jwt.sign(
    { sub: String(user.id), role: user.role, tv: Number(user.tokenVersion || 0) },
    env.jwt.accessSecret,
    {
      expiresIn: env.jwt.accessExpiresIn,
    },
  );
}

function signRefreshToken(user) {
  return jwt.sign(
    { sub: String(user.id), tv: Number(user.tokenVersion || 0) },
    env.jwt.refreshSecret,
    {
      expiresIn: env.jwt.refreshExpiresIn,
    },
  );
}

function verifyAccessToken(token) {
  return jwt.verify(token, env.jwt.accessSecret);
}

function verifyRefreshToken(token) {
  return jwt.verify(token, env.jwt.refreshSecret);
}

function generateAuthTokens(user) {
  return {
    accessToken: signAccessToken(user),
    refreshToken: signRefreshToken(user),
  };
}

module.exports = {
  signAccessToken,
  signRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
  generateAuthTokens,
};
