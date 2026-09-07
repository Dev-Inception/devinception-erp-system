const { DataTypes, defineModel } = require('./helpers');

module.exports = (db) =>
  defineModel(
    db,
    'StoreWarehouse',
    {
      storeId: { type: DataTypes.STRING(24), primaryKey: true, field: 'store_id' },
      warehouseId: { type: DataTypes.STRING(24), primaryKey: true, field: 'warehouse_id' },
    },
    { tableName: 'store_warehouses', timestamps: false },
  );
