const { DataTypes } = require('sequelize');
const { money, quantity, defineModel } = require('./helpers');

module.exports = function defineDamagedStockReturnItem(db) {
  return defineModel(
    db,
    'DamagedStockReturnItem',
    {
      id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
      damagedStockReturnId: {
        type: DataTypes.STRING(24),
        allowNull: false,
        field: 'damaged_stock_return_id',
      },
      position: { type: DataTypes.INTEGER, allowNull: false },
      stockReceiptItem: { type: DataTypes.BIGINT, field: 'stock_receipt_item_id' },
      product: { type: DataTypes.STRING(24), allowNull: false, field: 'product_id' },
      name: { type: DataTypes.STRING(160), allowNull: false },
      quantity: quantity({ validate: { min: 0 } }),
      unitCost: money(),
      lineTotal: money(),
    },
    { tableName: 'damaged_stock_return_items', timestamps: false },
  );
};
