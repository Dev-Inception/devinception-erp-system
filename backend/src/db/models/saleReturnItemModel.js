const { DataTypes } = require('sequelize');
const { money, quantity, defineModel } = require('./helpers');

module.exports = function defineSaleReturnItem(db) {
  return defineModel(
    db,
    'SaleReturnItem',
    {
      id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
      saleReturnId: { type: DataTypes.STRING(24), allowNull: false, field: 'sale_return_id' },
      position: { type: DataTypes.INTEGER, allowNull: false },
      product: { type: DataTypes.STRING(24), allowNull: false, field: 'product_id' },
      name: { type: DataTypes.STRING(160), allowNull: false },
      quantity: quantity({ validate: { min: 0 } }),
      unitPrice: money(),
      lineTotal: money(),
      cost: money(),
      source: {
        type: DataTypes.STRING(10),
        allowNull: false,
        defaultValue: 'WAREHOUSE',
        validate: { isIn: [['WAREHOUSE', 'VENDOR']] },
      },
      warehouse: { type: DataTypes.STRING(24), field: 'warehouse_id' },
    },
    { tableName: 'sale_return_items', timestamps: false },
  );
};
