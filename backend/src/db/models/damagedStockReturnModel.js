const { DataTypes } = require('sequelize');
const { id, defineModel } = require('./helpers');

module.exports = function defineDamagedStockReturn(db) {
  return defineModel(
    db,
    'DamagedStockReturn',
    {
      id: id(),
      number: { type: DataTypes.STRING(40), allowNull: false },
      supplier: { type: DataTypes.STRING(24), allowNull: false, field: 'supplier_id' },
      supplierName: { type: DataTypes.STRING(120), allowNull: false, defaultValue: '' },
      store: { type: DataTypes.STRING(24), allowNull: false, field: 'store_id' },
      warehouse: { type: DataTypes.STRING(24), allowNull: false, field: 'warehouse_id' },
      date: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
      truckVehicleNumber: { type: DataTypes.STRING(80), allowNull: false, defaultValue: '' },
      truckDriverName: { type: DataTypes.STRING(120), allowNull: false, defaultValue: '' },
      truckDriverPhone: { type: DataTypes.STRING(40), allowNull: false, defaultValue: '' },
      note: { type: DataTypes.STRING(500), allowNull: false, defaultValue: '' },
      gatePass: { type: DataTypes.STRING(24), field: 'gate_pass_id' },
      createdBy: { type: DataTypes.STRING(24), field: 'created_by_id' },
    },
    { tableName: 'damaged_stock_returns' },
  );
};
