const { DataTypes, id, quantity, defineModel } = require('./helpers');

module.exports = (db) =>
  defineModel(
    db,
    'StockLevel',
    {
      id: id(),
      product: { type: DataTypes.STRING(24), allowNull: false, field: 'product_id' },
      warehouse: { type: DataTypes.STRING(24), allowNull: false, field: 'warehouse_id' },
      quantity: quantity(),
      avgCost: { type: DataTypes.DECIMAL(30, 12), allowNull: false, defaultValue: 0 },
    },
    { tableName: 'stock_levels' },
  );
