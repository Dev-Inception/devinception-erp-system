const { DataTypes } = require('sequelize');
const { money, defineModel } = require('./helpers');

module.exports = function defineSaleLabour(db) {
  return defineModel(
    db,
    'SaleLabour',
    {
      id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
      saleId: { type: DataTypes.STRING(24), allowNull: false, field: 'sale_id' },
      position: { type: DataTypes.INTEGER, allowNull: false },
      labour: { type: DataTypes.STRING(24), allowNull: false, field: 'labour_id' },
      name: { type: DataTypes.STRING(100), allowNull: false },
      phoneNumber: { type: DataTypes.STRING(20), allowNull: false, defaultValue: '' },
      rent: money(),
    },
    { tableName: 'sale_labour', timestamps: false },
  );
};
