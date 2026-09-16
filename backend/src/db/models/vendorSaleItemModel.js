const { DataTypes } = require('sequelize');
const { money, quantity, defineModel } = require('./helpers');

module.exports = function defineVendorSaleItem(db) {
  return defineModel(
    db,
    'VendorSaleItem',
    {
      id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
      vendorSaleId: { type: DataTypes.STRING(24), allowNull: false, field: 'vendor_sale_id' },
      position: { type: DataTypes.INTEGER, allowNull: false },
      product: { type: DataTypes.STRING(24), allowNull: false, field: 'product_id' },
      name: { type: DataTypes.STRING(160), allowNull: false },
      quantity: quantity({ validate: { min: 0 } }),
      unitPrice: money(),
      lineTotal: money(),
      cost: money(),
    },
    { tableName: 'vendor_sale_items', timestamps: false },
  );
};
