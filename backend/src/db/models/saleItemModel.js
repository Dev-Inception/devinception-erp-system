const { DataTypes, money, quantity, defineModel } = require('./helpers');

module.exports = (db) =>
  defineModel(
    db,
    'SaleItem',
    {
      id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
      saleId: { type: DataTypes.STRING(24), allowNull: false, field: 'sale_id' },
      position: { type: DataTypes.INTEGER, allowNull: false },
      product: { type: DataTypes.STRING(24), allowNull: false, field: 'product_id' },
      name: { type: DataTypes.STRING(160), allowNull: false },
      quantity: quantity({ defaultValue: undefined }),
      unitPrice: money({ defaultValue: undefined }),
      lineTotal: money({ defaultValue: undefined }),
      cost: money(),
    },
    { tableName: 'sale_items', timestamps: false },
  );
