const { DataTypes, money, defineModel } = require('./helpers');
module.exports = (db) =>
  defineModel(
    db,
    'StockReceiptLabour',
    {
      id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
      stockReceiptId: { type: DataTypes.STRING(24), allowNull: false, field: 'stock_receipt_id' },
      position: { type: DataTypes.INTEGER, allowNull: false },
      labour: { type: DataTypes.STRING(24), allowNull: false, field: 'labour_id' },
      name: { type: DataTypes.STRING(100), allowNull: false },
      phoneNumber: { type: DataTypes.STRING(30), allowNull: false, defaultValue: '' },
      rent: money(),
    },
    { tableName: 'stock_receipt_labour', timestamps: false },
  );
