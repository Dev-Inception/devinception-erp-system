const { PAYMENT_METHODS } = require('../../utils/finance');
const { DataTypes, id, money, defineModel } = require('./helpers');

module.exports = (db) =>
  defineModel(
    db,
    'Sale',
    {
      id: id(),
      number: { type: DataTypes.STRING(100), allowNull: false, unique: true },
      customer: { type: DataTypes.STRING(24), field: 'customer_id' },
      customerName: { type: DataTypes.STRING(120), allowNull: false, defaultValue: 'Walk-in' },
      warehouse: { type: DataTypes.STRING(24), allowNull: false, field: 'warehouse_id' },
      date: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
      subtotal: money({ defaultValue: undefined }),
      discount: money(),
      taxPercent: { type: DataTypes.DECIMAL(9, 4), allowNull: false, defaultValue: 0 },
      tax: money(),
      total: money({ defaultValue: undefined }),
      cost: money(),
      paymentMethod: {
        type: DataTypes.STRING(30),
        allowNull: false,
        validate: { isIn: [PAYMENT_METHODS] },
      },
      cashAmount: money(),
      onlineAmount: money(),
      creditAmount: money(),
      bankAccount: { type: DataTypes.STRING(24), field: 'bank_account_id' },
      transferReceiptRef: { type: DataTypes.TEXT, allowNull: false, defaultValue: '' },
      gatePass: { type: DataTypes.STRING(24), field: 'gate_pass_id' },
      createdBy: { type: DataTypes.STRING(24), field: 'created_by_id' },
    },
    { tableName: 'sales' },
  );
