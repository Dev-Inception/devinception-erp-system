const { DataTypes } = require('sequelize');
const { quantity, defineModel } = require('./helpers');

module.exports = function defineStockReceiptItem(db) {
  return defineModel(
    db,
    'StockReceiptItem',
    {
      id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
      stockReceiptId: { type: DataTypes.STRING(24), allowNull: false, field: 'stock_receipt_id' },
      position: { type: DataTypes.INTEGER, allowNull: false },
      product: { type: DataTypes.STRING(24), allowNull: false, field: 'product_id' },
      name: { type: DataTypes.STRING(160), allowNull: false },
      receivedQuantity: quantity({ validate: { min: 0 } }),
      damagedQuantity: quantity({ validate: { min: 0 } }),
    },
    { tableName: 'stock_receipt_items', timestamps: false },
  );
};
