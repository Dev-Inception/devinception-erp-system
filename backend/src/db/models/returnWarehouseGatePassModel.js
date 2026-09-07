const { DataTypes } = require('sequelize');
const { defineModel } = require('./helpers');

module.exports = function defineReturnWarehouseGatePass(db) {
  return defineModel(
    db,
    'ReturnWarehouseGatePass',
    {
      id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
      saleReturn: { type: DataTypes.STRING(24), allowNull: false, field: 'sale_return_id' },
      warehouse: { type: DataTypes.STRING(24), allowNull: false, field: 'warehouse_id' },
      gatePass: { type: DataTypes.STRING(24), allowNull: false, field: 'gate_pass_id' },
    },
    { tableName: 'return_warehouse_gate_passes', timestamps: false },
  );
};
