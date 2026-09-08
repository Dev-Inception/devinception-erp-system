const { DataTypes } = require('sequelize');
const { defineModel } = require('./helpers');

// Join table for Store.warehouses[] — many-to-many; a warehouse can be
// shared by more than one store (see migration 001).
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
