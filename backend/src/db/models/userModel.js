const { DataTypes } = require('sequelize');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { id, defineModel } = require('./helpers');
const { ROLES } = require('../../utils/constants');

module.exports = function defineUser(db) {
  const User = defineModel(
    db,
    'User',
    {
      id: id(),
      name: { type: DataTypes.STRING(80), allowNull: false },
      email: {
        type: DataTypes.STRING(255),
        allowNull: false,
        set(value) {
          this.setDataValue(
            'email',
            String(value ?? '')
              .trim()
              .toLowerCase(),
          );
        },
      },
      password: { type: DataTypes.STRING(255), allowNull: false },
      role: { type: DataTypes.STRING(100), allowNull: false, defaultValue: ROLES.CASHIER },
      isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
      store: { type: DataTypes.STRING(24), field: 'store_id' },
      passwordResetToken: { type: DataTypes.STRING(255), field: 'password_reset_token' },
      passwordResetExpires: { type: DataTypes.DATE, field: 'password_reset_expires' },
      passwordChangedAt: { type: DataTypes.DATE, field: 'password_changed_at' },
      tokenVersion: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        field: 'token_version',
      },
    },
    {
      tableName: 'users',
      defaultScope: {
        attributes: {
          exclude: [
            'password',
            'passwordResetToken',
            'passwordResetExpires',
            'passwordChangedAt',
            'tokenVersion',
          ],
        },
      },
      scopes: {
        // Opt back in to the fields defaultScope hides, for auth flows that
        // need them (login, refresh, logout) — mirrors Mongoose's
        // `.select('+password')` pattern for `select: false` fields.
        withSecrets: { attributes: {} },
      },
      hooks: {
        async beforeSave(user) {
          if (!user.changed('password')) return;
          user.password = await bcrypt.hash(user.password, 10);
          if (!user.isNewRecord) {
            // Subtract 1s to avoid a race where a token is issued in the same
            // second as the save, which would wrongly invalidate it.
            user.passwordChangedAt = new Date(Date.now() - 1000);
          }
        },
      },
    },
  );

  User.prototype.comparePassword = function comparePassword(candidate) {
    return bcrypt.compare(candidate, this.password);
  };

  User.prototype.passwordChangedAfter = function passwordChangedAfter(jwtIat) {
    if (!this.passwordChangedAt) return false;
    const changedAtSec = Math.floor(this.passwordChangedAt.getTime() / 1000);
    return jwtIat < changedAtSec;
  };

  User.prototype.createPasswordResetToken = function createPasswordResetToken(expiresMin) {
    const rawToken = crypto.randomBytes(32).toString('hex');
    this.passwordResetToken = crypto.createHash('sha256').update(rawToken).digest('hex');
    this.passwordResetExpires = new Date(Date.now() + expiresMin * 60 * 1000);
    return rawToken;
  };

  return User;
};
