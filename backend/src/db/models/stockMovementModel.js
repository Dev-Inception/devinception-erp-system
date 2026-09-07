const { DataTypes } = require('sequelize');
const { defineModel } = require('./helpers');

module.exports = function defineStockMovement(db) {
  return defineModel(
    db,
    'StockMovement',
    {
      id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
      product: { type: DataTypes.STRING(24), allowNull: false, field: 'product_id' },
      warehouse: { type: DataTypes.STRING(24), allowNull: false, field: 'warehouse_id' },
      type: {
        type: DataTypes.STRING(10),
        allowNull: false,
        validate: { isIn: [['IN', 'OUT', 'ADJUST']] },
      },
      quantity: { type: DataTypes.DECIMAL(20, 6), allowNull: false },
      unitCost: {
        type: DataTypes.DECIMAL(30, 12),
        allowNull: false,
        defaultValue: 0,
        validate: { min: 0 },
      },
      totalCost: { type: DataTypes.BIGINT, validate: { min: 0 } },
      refType: { type: DataTypes.STRING(50), allowNull: false, defaultValue: '' },
      refNo: { type: DataTypes.STRING(100), allowNull: false, defaultValue: '' },
      date: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    },
    { tableName: 'stock_movements' },
  );
};
