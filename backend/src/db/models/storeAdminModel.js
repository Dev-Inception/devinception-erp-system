const { DataTypes } = require('sequelize');
const { defineModel } = require('./helpers');

// Join table for User.adminStores[] — which ADMIN user(s) own which
// store(s). A store can have more than one admin (co-owners); an admin can
// own more than one store (super admin sells stores individually).
module.exports = function defineStoreAdmin(db) {
  return defineModel(
    db,
    'StoreAdmin',
    {
      userId: {
        type: DataTypes.STRING(24),
        allowNull: false,
        primaryKey: true,
        field: 'user_id',
      },
      storeId: {
        type: DataTypes.STRING(24),
        allowNull: false,
        primaryKey: true,
        field: 'store_id',
      },
    },
    { tableName: 'store_admins', timestamps: false },
  );
};
