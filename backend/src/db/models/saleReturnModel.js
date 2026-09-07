const { DataTypes, id, money, defineModel } = require('./helpers');
module.exports = (db) =>
  defineModel(
    db,
    'SaleReturn',
    {
      id: id(),
      number: { type: DataTypes.STRING(100), allowNull: false, unique: true },
      sale: { type: DataTypes.STRING(24), allowNull: false, field: 'sale_id' },
      saleNumber: { type: DataTypes.STRING(100), allowNull: false },
      customer: { type: DataTypes.STRING(24), field: 'customer_id' },
      customerName: { type: DataTypes.STRING(120), allowNull: false, defaultValue: '' },
      date: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
      subtotal: money({ defaultValue: undefined }),
      discount: money(),
      tax: money(),
      total: money({ defaultValue: undefined }),
      cost: money(),
      note: { type: DataTypes.STRING(500), allowNull: false, defaultValue: '' },
      createdBy: { type: DataTypes.STRING(24), field: 'created_by_id' },
    },
    { tableName: 'sale_returns' },
  );
