const { DataTypes, money, quantity, defineModel } = require('./helpers');
module.exports = (db) =>
  defineModel(
    db,
    'SaleReturnItem',
    {
      id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
      saleReturnId: { type: DataTypes.STRING(24), allowNull: false, field: 'sale_return_id' },
      position: { type: DataTypes.INTEGER, allowNull: false },
      product: { type: DataTypes.STRING(24), allowNull: false, field: 'product_id' },
      name: { type: DataTypes.STRING(160), allowNull: false },
      quantity: quantity({ defaultValue: undefined }),
      unitPrice: money({ defaultValue: undefined }),
      lineTotal: money({ defaultValue: undefined }),
      cost: money(),
      source: { type: DataTypes.STRING(12), allowNull: false, defaultValue: 'WAREHOUSE' },
      warehouse: { type: DataTypes.STRING(24), field: 'warehouse_id' },
    },
    { tableName: 'sale_return_items', timestamps: false },
  );
