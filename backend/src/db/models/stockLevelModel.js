const { DataTypes } = require('sequelize');
const { quantity, defineModel } = require('./helpers');

module.exports = function defineStockLevel(db) {
  return defineModel(
    db,
    'StockLevel',
    {
      id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
      product: { type: DataTypes.STRING(24), allowNull: false, field: 'product_id' },
      warehouse: { type: DataTypes.STRING(24), allowNull: false, field: 'warehouse_id' },
      quantity: quantity(),
      avgCost: {
        type: DataTypes.DECIMAL(30, 12),
        allowNull: false,
        defaultValue: 0,
        validate: { min: 0 },
      },
    },
    { tableName: 'stock_levels' },
  );
};
