const { DataTypes } = require('sequelize');
const { money, quantity, defineModel } = require('./helpers');

module.exports = function defineVendorSaleReturnItem(db) {
  return defineModel(
    db,
    'VendorSaleReturnItem',
    {
      id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
      vendorSaleReturnId: {
        type: DataTypes.STRING(24),
        allowNull: false,
        field: 'vendor_sale_return_id',
      },
      position: { type: DataTypes.INTEGER, allowNull: false },
      product: { type: DataTypes.STRING(24), allowNull: false, field: 'product_id' },
      name: { type: DataTypes.STRING(160), allowNull: false },
      quantity: quantity({ validate: { min: 0 } }),
      unitPrice: money(),
      lineTotal: money(),
      cost: money(),
    },
    { tableName: 'vendor_sale_return_items', timestamps: false },
  );
};
