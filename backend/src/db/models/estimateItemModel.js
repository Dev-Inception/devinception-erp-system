const { DataTypes } = require('sequelize');
const { money, quantity, defineModel } = require('./helpers');

module.exports = function defineEstimateItem(db) {
  return defineModel(
    db,
    'EstimateItem',
    {
      id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
      estimateId: { type: DataTypes.STRING(24), allowNull: false, field: 'estimate_id' },
      position: { type: DataTypes.INTEGER, allowNull: false },
      product: { type: DataTypes.STRING(24), allowNull: false, field: 'product_id' },
      name: { type: DataTypes.STRING(160), allowNull: false },
      quantity: quantity({ validate: { min: 0 } }),
      unitPrice: money(),
      lineTotal: money(),
    },
    { tableName: 'estimate_items', timestamps: false },
  );
};
