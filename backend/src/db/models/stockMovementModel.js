const { DataTypes, id, quantity, defineModel } = require('./helpers');

module.exports = (db) =>
  defineModel(
    db,
    'StockMovement',
    {
      id: id(),
      product: { type: DataTypes.STRING(24), allowNull: false, field: 'product_id' },
      warehouse: { type: DataTypes.STRING(24), allowNull: false, field: 'warehouse_id' },
      type: { type: DataTypes.ENUM('IN', 'OUT', 'ADJUST'), allowNull: false },
      quantity: quantity({ defaultValue: undefined }),
      unitCost: { type: DataTypes.DECIMAL(30, 12), allowNull: false, defaultValue: 0 },
      totalCost: DataTypes.BIGINT,
      refType: { type: DataTypes.STRING(30), allowNull: false, defaultValue: '' },
      refNo: { type: DataTypes.STRING(100), allowNull: false, defaultValue: '' },
      date: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    },
    { tableName: 'stock_movements' },
  );
