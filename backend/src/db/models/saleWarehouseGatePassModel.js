const { DataTypes } = require('sequelize');
const { defineModel } = require('./helpers');

module.exports = function defineSaleWarehouseGatePass(db) {
  return defineModel(
    db,
    'SaleWarehouseGatePass',
    {
      id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
      sale: { type: DataTypes.STRING(24), allowNull: false, field: 'sale_id' },
      warehouse: { type: DataTypes.STRING(24), allowNull: false, field: 'warehouse_id' },
      gatePass: { type: DataTypes.STRING(24), allowNull: false, field: 'gate_pass_id' },
    },
    { tableName: 'sale_warehouse_gate_passes', timestamps: false },
  );
};
