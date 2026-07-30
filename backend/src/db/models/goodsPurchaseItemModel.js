const { DataTypes, money, quantity, defineModel } = require('./helpers');

module.exports = (db) =>
  defineModel(
    db,
    'GoodsPurchaseItem',
    {
      id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
      purchaseId: { type: DataTypes.STRING(24), allowNull: false, field: 'purchase_id' },
      position: { type: DataTypes.INTEGER, allowNull: false },
      product: { type: DataTypes.STRING(24), allowNull: false, field: 'product_id' },
      name: { type: DataTypes.STRING(160), allowNull: false },
      quantity: quantity({ defaultValue: undefined }),
      unitCost: money({ defaultValue: undefined }),
      taxPercent: { type: DataTypes.DECIMAL(9, 4), allowNull: false, defaultValue: 0 },
      tax: money(),
      lineTotal: money({ defaultValue: undefined }),
    },
    { tableName: 'goods_purchase_items', timestamps: false },
  );
