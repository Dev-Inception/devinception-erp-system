const { DataTypes } = require('sequelize');
const { id, money, defineModel } = require('./helpers');
const { PAYMENT_METHODS } = require('../../utils/finance');

module.exports = function defineVendorSale(db) {
  return defineModel(
    db,
    'VendorSale',
    {
      id: id(),
      number: { type: DataTypes.STRING(40), allowNull: false },
      vendor: { type: DataTypes.STRING(24), allowNull: false, field: 'vendor_id' },
      vendorName: { type: DataTypes.STRING(120), allowNull: false, defaultValue: '' },
      store: { type: DataTypes.STRING(24), allowNull: false, field: 'store_id' },
      warehouse: { type: DataTypes.STRING(24), allowNull: false, field: 'warehouse_id' },
      date: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },

      subtotal: money(),
      discount: money(),
      taxPercent: {
        type: DataTypes.DECIMAL(9, 4),
        allowNull: false,
        defaultValue: 0,
        validate: { min: 0 },
      },
      tax: money(),
      total: money(),
      cost: money(),

      paymentMethod: {
        type: DataTypes.STRING(20),
        allowNull: false,
        validate: { isIn: [PAYMENT_METHODS] },
      },
      cashAmount: money(),
      onlineAmount: money(),
      creditAmount: money(),
      bankAccount: { type: DataTypes.STRING(24), field: 'bank_account_id' },
      transferReceiptRef: { type: DataTypes.STRING(300), allowNull: false, defaultValue: '' },
      note: { type: DataTypes.STRING(500), allowNull: false, defaultValue: '' },

      lastEditedAt: { type: DataTypes.DATE },
      lastEditedBy: { type: DataTypes.STRING(24), field: 'last_edited_by_id' },
      createdBy: { type: DataTypes.STRING(24), field: 'created_by_id' },
    },
    { tableName: 'vendor_sales' },
  );
};
