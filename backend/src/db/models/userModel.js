const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { DataTypes, id, defineModel } = require('./helpers');

module.exports = (db) => {
  const User = defineModel(
    db,
    'User',
    {
      id: id(),
      name: { type: DataTypes.STRING(80), allowNull: false },
      email: {
        type: DataTypes.STRING,
        allowNull: false,
        set(value) {
          this.setDataValue('email', value.trim().toLowerCase());
        },
      },
      password: { type: DataTypes.STRING, allowNull: false },
      role: { type: DataTypes.STRING(80), allowNull: false, defaultValue: 'cashier' },
      isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
      store: { type: DataTypes.STRING(24), field: 'store_id' },
      passwordResetToken: DataTypes.STRING,
      passwordResetExpires: DataTypes.DATE,
      passwordChangedAt: DataTypes.DATE,
      tokenVersion: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
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
        withPassword: {
          attributes: {
            include: [
              'password',
              'passwordResetToken',
              'passwordResetExpires',
              'passwordChangedAt',
              'tokenVersion',
            ],
          },
        },
      },
      hooks: {
        async beforeSave(user) {
          if (!user.changed('password')) return;
          user.password = await bcrypt.hash(user.password, 10);
          if (!user.isNewRecord) user.passwordChangedAt = new Date(Date.now() - 1000);
        },
      },
    },
  );

  User.prototype.comparePassword = function comparePassword(candidate) {
    return bcrypt.compare(candidate, this.password);
  };
  User.prototype.passwordChangedAfter = function passwordChangedAfter(jwtIat) {
    if (!this.passwordChangedAt) return false;
    return jwtIat < Math.floor(this.passwordChangedAt.getTime() / 1000);
  };
  User.prototype.createPasswordResetToken = function createPasswordResetToken(expiresMin) {
    const rawToken = crypto.randomBytes(32).toString('hex');
    this.passwordResetToken = crypto.createHash('sha256').update(rawToken).digest('hex');
    this.passwordResetExpires = new Date(Date.now() + expiresMin * 60 * 1000);
    return rawToken;
  };

  return User;
};
