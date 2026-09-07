const { DataTypes } = require('sequelize');
const { money, defineModel } = require('./helpers');

module.exports = function defineStockReceiptLabour(db) {
  return defineModel(
    db,
    'StockReceiptLabour',
    {
      id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
      stockReceiptId: { type: DataTypes.STRING(24), allowNull: false, field: 'stock_receipt_id' },
      position: { type: DataTypes.INTEGER, allowNull: false },
      labour: { type: DataTypes.STRING(24), allowNull: false, field: 'labour_id' },
      name: { type: DataTypes.STRING(100), allowNull: false },
      phoneNumber: { type: DataTypes.STRING(20), allowNull: false, defaultValue: '' },
      rent: money(),
    },
    { tableName: 'stock_receipt_labour', timestamps: false },
  );
};
