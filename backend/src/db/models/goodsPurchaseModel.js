const { PAYMENT_METHODS } = require('../../utils/finance');
const { DataTypes, id, money, defineModel } = require('./helpers');

module.exports = (db) =>
  defineModel(
    db,
    'GoodsPurchase',
    {
      id: id(),
      number: { type: DataTypes.STRING(100), allowNull: false, unique: true },
      vendorInvoiceNo: { type: DataTypes.STRING(100), allowNull: false, defaultValue: '' },
      vendor: { type: DataTypes.STRING(24), allowNull: false, field: 'vendor_id' },
      vendorName: { type: DataTypes.STRING(120), allowNull: false, defaultValue: '' },
      warehouse: { type: DataTypes.STRING(24), allowNull: false, field: 'warehouse_id' },
      date: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
      subtotal: money(),
      discount: money(),
      tax: money(),
      total: money({ defaultValue: undefined }),
      paid: money(),
      balance: money({ signed: true }),
      paymentMethod: {
        type: DataTypes.STRING(30),
        validate: { isIn: [PAYMENT_METHODS] },
      },
      bankAccount: { type: DataTypes.STRING(24), field: 'bank_account_id' },
      notes: { type: DataTypes.TEXT, allowNull: false, defaultValue: '' },
      createdBy: { type: DataTypes.STRING(24), field: 'created_by_id' },
      gatePass: { type: DataTypes.STRING(24), field: 'gate_pass_id' },
    },
    { tableName: 'goods_purchases' },
  );
