const { DataTypes } = require('sequelize');
const { id, money, defineModel } = require('./helpers');

module.exports = function defineVendorSaleReturn(db) {
  return defineModel(
    db,
    'VendorSaleReturn',
    {
      id: id(),
      number: { type: DataTypes.STRING(40), allowNull: false },
      vendorSale: { type: DataTypes.STRING(24), allowNull: false, field: 'vendor_sale_id' },
      vendorSaleNumber: { type: DataTypes.STRING(40), allowNull: false },
      vendor: { type: DataTypes.STRING(24), allowNull: false, field: 'vendor_id' },
      vendorName: { type: DataTypes.STRING(120), allowNull: false, defaultValue: '' },
      warehouse: { type: DataTypes.STRING(24), allowNull: false, field: 'warehouse_id' },
      date: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
      subtotal: money(),
      discount: money(),
      tax: money(),
      total: money(),
      cost: money(),
      note: { type: DataTypes.STRING(500), allowNull: false, defaultValue: '' },
      createdBy: { type: DataTypes.STRING(24), field: 'created_by_id' },
    },
    { tableName: 'vendor_sale_returns' },
  );
};
