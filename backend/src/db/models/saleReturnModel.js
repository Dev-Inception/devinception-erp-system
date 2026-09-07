const { DataTypes } = require('sequelize');
const { id, money, defineModel } = require('./helpers');

module.exports = function defineSaleReturn(db) {
  return defineModel(
    db,
    'SaleReturn',
    {
      id: id(),
      number: { type: DataTypes.STRING(40), allowNull: false },
      sale: { type: DataTypes.STRING(24), allowNull: false, field: 'sale_id' },
      saleNumber: { type: DataTypes.STRING(40), allowNull: false },
      customer: { type: DataTypes.STRING(24), field: 'customer_id' },
      customerName: { type: DataTypes.STRING(120), allowNull: false, defaultValue: '' },
      date: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
      subtotal: money(),
      discount: money(),
      tax: money(),
      total: money(),
      cost: money(),
      note: { type: DataTypes.STRING(500), allowNull: false, defaultValue: '' },
      createdBy: { type: DataTypes.STRING(24), field: 'created_by_id' },
    },
    { tableName: 'sale_returns' },
  );
};
