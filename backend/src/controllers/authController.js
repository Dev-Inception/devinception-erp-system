const authService = require("../services/authService");
const asyncHandler = require("../utils/asyncHandler");
const { sendSuccess } = require("../utils/ApiResponse");
const env = require("../config/env");

// Set the refresh token as an httpOnly cookie so it isn't exposed to JS.
function setRefreshCookie(res, refreshToken) {
  res.cookie("refreshToken", refreshToken, {
    httpOnly: true,
    secure: env.nodeEnv === "production",
    sameSite: "strict",
    path: "/api/auth",
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  });
}

const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  const { user, tokens } = await authService.login({ email, password });

  setRefreshCookie(res, tokens.refreshToken);
  return sendSuccess(res, 200, "Login successful", {
    user,
    accessToken: tokens.accessToken,
  });
});

const refresh = asyncHandler(async (req, res) => {
  // Accept the refresh token from the cookie or the body.
  const refreshToken = req.cookies?.refreshToken || req.body.refreshToken;
  const tokens = await authService.refresh(refreshToken);

  setRefreshCookie(res, tokens.refreshToken);
  return sendSuccess(res, 200, "Token refreshed", {
    accessToken: tokens.accessToken,
  });
});

const logout = asyncHandler(async (_req, res) => {
  res.clearCookie("refreshToken", { path: "/api/auth" });
  return sendSuccess(res, 200, "Logged out");
});

const forgotPassword = asyncHandler(async (req, res) => {
  await authService.forgotPassword(req.body.email);
  // Generic message regardless of whether the email exists.
  return sendSuccess(
    res,
    200,
    "If that email is registered, a reset link has been sent"
  );
});

const resetPassword = asyncHandler(async (req, res) => {
  const { token, password } = req.body;
  const tokens = await authService.resetPassword(token, password);

  setRefreshCookie(res, tokens.refreshToken);
  return sendSuccess(res, 200, "Password has been reset", {
    accessToken: tokens.accessToken,
  });
});

const changePassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  const tokens = await authService.changePassword(
    req.user._id,
    currentPassword,
    newPassword
  );

  setRefreshCookie(res, tokens.refreshToken);
  return sendSuccess(res, 200, "Password changed", {
    accessToken: tokens.accessToken,
  });
});

const me = asyncHandler(async (req, res) => {
  return sendSuccess(res, 200, "Current user", { user: req.user.toJSON() });
});

module.exports = {
  login,
  refresh,
  logout,
  forgotPassword,
  resetPassword,
  changePassword,
  me,
};
