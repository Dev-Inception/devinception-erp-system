const crypto = require("crypto");
const User = require("../models/userModel");
const ApiError = require("../utils/ApiError");
const env = require("../config/env");
const tokenService = require("./tokenService");
const { sendPasswordResetEmail } = require("./emailService");

/**
 * Business logic for authentication. Controllers stay thin and just
 * adapt HTTP <-> these functions.
 */

async function login({ email, password }) {
  // Password is select:false, so request it explicitly.
  const user = await User.findOne({ email }).select("+password");
  if (!user || !(await user.comparePassword(password))) {
    throw ApiError.unauthorized("Invalid email or password");
  }
  if (!user.isActive) {
    throw ApiError.forbidden("Account is deactivated");
  }

  const tokens = tokenService.generateAuthTokens(user);
  return { user: user.toJSON(), tokens };
}

async function refresh(refreshToken) {
  if (!refreshToken) {
    throw ApiError.unauthorized("Refresh token is required");
  }

  let payload;
  try {
    payload = tokenService.verifyRefreshToken(refreshToken);
  } catch {
    throw ApiError.unauthorized("Invalid or expired refresh token");
  }

  const user = await User.findById(payload.sub).select("+passwordChangedAt");
  if (!user || !user.isActive) {
    throw ApiError.unauthorized("User no longer exists or is inactive");
  }
  if (user.passwordChangedAfter(payload.iat)) {
    throw ApiError.unauthorized("Password changed, please log in again");
  }

  return tokenService.generateAuthTokens(user);
}

async function forgotPassword(email) {
  const user = await User.findOne({ email });

  // Always behave the same way whether or not the email exists, so we
  // don't leak which addresses are registered.
  if (!user) return;

  const rawToken = user.createPasswordResetToken(env.resetTokenExpiresMin);
  await user.save({ validateBeforeSave: false });

  const resetUrl = `${env.clientUrl}/reset-password?token=${rawToken}`;

  try {
    await sendPasswordResetEmail(user.email, resetUrl);
  } catch (err) {
    // Roll back the token so a failed send doesn't leave a dangling reset.
    user.passwordResetToken = undefined;
    user.passwordResetExpires = undefined;
    await user.save({ validateBeforeSave: false });
    throw ApiError.badRequest("Failed to send reset email, try again later");
  }
}

async function resetPassword(rawToken, newPassword) {
  const hashed = crypto.createHash("sha256").update(rawToken).digest("hex");

  const user = await User.findOne({
    passwordResetToken: hashed,
    passwordResetExpires: { $gt: new Date() },
  }).select("+password");

  if (!user) {
    throw ApiError.badRequest("Token is invalid or has expired");
  }

  user.password = newPassword;
  user.passwordResetToken = undefined;
  user.passwordResetExpires = undefined;
  await user.save();

  // Issue fresh tokens so the user is logged in after resetting.
  return tokenService.generateAuthTokens(user);
}

async function changePassword(userId, currentPassword, newPassword) {
  const user = await User.findById(userId).select("+password");
  if (!user) throw ApiError.notFound("User not found");

  if (!(await user.comparePassword(currentPassword))) {
    throw ApiError.unauthorized("Current password is incorrect");
  }

  user.password = newPassword;
  await user.save();

  return tokenService.generateAuthTokens(user);
}

module.exports = {
  login,
  refresh,
  forgotPassword,
  resetPassword,
  changePassword,
};
