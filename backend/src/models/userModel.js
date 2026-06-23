const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const { ROLES } = require("../utils/constants");

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Name is required"],
      trim: true,
      maxlength: 80,
    },
    email: {
      type: String,
      required: [true, "Email is required"],
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    password: {
      type: String,
      required: [true, "Password is required"],
      minlength: 8,
      // Never return the hash unless explicitly selected.
      select: false,
    },
    // Role name referencing the Role collection. Not an enum: roles are
    // dynamic. The service layer verifies the role exists before assigning.
    role: {
      type: String,
      default: ROLES.CASHIER,
      index: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },

    // Password reset: we store only the SHA-256 hash of the token, never
    // the raw token, so a DB leak can't be used to reset accounts.
    passwordResetToken: { type: String, select: false },
    passwordResetExpires: { type: Date, select: false },

    // Bumped whenever the password changes; lets us invalidate old JWTs.
    passwordChangedAt: { type: Date, select: false },
  },
  { timestamps: true }
);

// Hash the password before saving whenever it has been modified.
// Mongoose 9 async middleware is promise-based (no `next` callback).
userSchema.pre("save", async function hashPassword() {
  if (!this.isModified("password")) return;

  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);

  if (!this.isNew) {
    // Subtract 1s to avoid a race where the token is issued in the same
    // second as the save, which would wrongly invalidate it.
    this.passwordChangedAt = new Date(Date.now() - 1000);
  }
});

// Compare a plaintext candidate against the stored hash.
userSchema.methods.comparePassword = function comparePassword(candidate) {
  return bcrypt.compare(candidate, this.password);
};

// True if the password changed after the given JWT "iat" (seconds).
userSchema.methods.passwordChangedAfter = function passwordChangedAfter(jwtIat) {
  if (!this.passwordChangedAt) return false;
  const changedAtSec = Math.floor(this.passwordChangedAt.getTime() / 1000);
  return jwtIat < changedAtSec;
};

// Generate a reset token: return the RAW token (emailed to user) and
// store its hash + expiry on the document.
userSchema.methods.createPasswordResetToken = function createPasswordResetToken(
  expiresMin
) {
  const rawToken = crypto.randomBytes(32).toString("hex");

  this.passwordResetToken = crypto
    .createHash("sha256")
    .update(rawToken)
    .digest("hex");
  this.passwordResetExpires = new Date(Date.now() + expiresMin * 60 * 1000);

  return rawToken;
};

// Strip sensitive fields from any JSON serialization.
userSchema.set("toJSON", {
  transform: (_doc, ret) => {
    delete ret.password;
    delete ret.passwordResetToken;
    delete ret.passwordResetExpires;
    delete ret.passwordChangedAt;
    delete ret.__v;
    return ret;
  },
});

module.exports = mongoose.model("User", userSchema);
