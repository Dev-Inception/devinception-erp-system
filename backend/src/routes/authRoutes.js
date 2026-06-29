const express = require("express");
const authController = require("../controllers/authController");
const { protect } = require("../middlewares/authMiddleware");
const { validate } = require("../middlewares/validateMiddleware");
const { loginLimiter, passwordResetLimiter } = require("../middlewares/rateLimit");
const {
  loginValidator,
  forgotPasswordValidator,
  resetPasswordValidator,
  changePasswordValidator,
} = require("../validators/authValidator");

const router = express.Router();

// Public. There is no self-registration: accounts are created by an admin
// (or super admin) via POST /api/users. The login and password-reset routes
// are rate limited to blunt brute-force and email-flooding attempts.
router.post("/login", loginLimiter, loginValidator, validate, authController.login);
router.post("/refresh", authController.refresh);
router.post("/logout", authController.logout);
router.post(
  "/forgot-password",
  passwordResetLimiter,
  forgotPasswordValidator,
  validate,
  authController.forgotPassword
);
router.post(
  "/reset-password",
  passwordResetLimiter,
  resetPasswordValidator,
  validate,
  authController.resetPassword
);

// Authenticated
router.get("/me", protect, authController.me);
router.patch(
  "/change-password",
  protect,
  changePasswordValidator,
  validate,
  authController.changePassword
);

module.exports = router;
