const { DataTypes } = require('sequelize');
const { defineModel } = require('./helpers');

// Join table for Store.warehouses[] — a warehouse belongs to at most one
// store (see migration 001's UNIQUE(warehouse_id)).
module.exports = function defineStoreWarehouse(db) {
  return defineModel(
    db,
    'StoreWarehouse',
    {
      storeId: {
        type: DataTypes.STRING(24),
        allowNull: false,
        primaryKey: true,
        field: 'store_id',
      },
      warehouseId: {
        type: DataTypes.STRING(24),
        allowNull: false,
        primaryKey: true,
        field: 'warehouse_id',
      },
    },
    { tableName: 'store_warehouses', timestamps: false },
  );
};
