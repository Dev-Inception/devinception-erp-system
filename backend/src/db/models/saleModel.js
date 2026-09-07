const { DataTypes } = require('sequelize');
const { id, money, defineModel } = require('./helpers');
const { PAYMENT_METHODS } = require('../../utils/finance');

module.exports = function defineSale(db) {
  return defineModel(
    db,
    'Sale',
    {
      id: id(),
      number: { type: DataTypes.STRING(40), allowNull: false },
      customer: { type: DataTypes.STRING(24), field: 'customer_id' },
      customerName: { type: DataTypes.STRING(120), allowNull: false, defaultValue: 'Walk-in' },
      store: { type: DataTypes.STRING(24), allowNull: false, field: 'store_id' },
      warehouse: { type: DataTypes.STRING(24), allowNull: false, field: 'warehouse_id' },
      date: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },

      transportDriverName: { type: DataTypes.STRING(120), allowNull: false, defaultValue: '' },
      transportDriverPhone: { type: DataTypes.STRING(40), allowNull: false, defaultValue: '' },
      transportVehicleNumber: { type: DataTypes.STRING(40), allowNull: false, defaultValue: '' },
      transporter: { type: DataTypes.STRING(24), field: 'transporter_id' },
      transportFareMethod: { type: DataTypes.STRING(30) },
      transportFareBankAccount: {
        type: DataTypes.STRING(24),
        field: 'transport_fare_bank_account_id',
      },

      subtotal: money(),
      discount: money(),
      taxPercent: {
        type: DataTypes.DECIMAL(9, 4),
        allowNull: false,
        defaultValue: 0,
        validate: { min: 0 },
      },
      tax: money(),
      transportFare: money(),
      labourRent: money(),
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
      additionalPaidAmount: money(),
      returnedTotal: money(),
      bankAccount: { type: DataTypes.STRING(24), field: 'bank_account_id' },
      transferReceiptRef: { type: DataTypes.STRING(300), allowNull: false, defaultValue: '' },
      lastEditedAt: { type: DataTypes.DATE },
      lastEditedBy: { type: DataTypes.STRING(24), field: 'last_edited_by_id' },

      gatePass: { type: DataTypes.STRING(24), field: 'gate_pass_id' },
      vendorGatePass: { type: DataTypes.STRING(24), field: 'vendor_gate_pass_id' },
      createdBy: { type: DataTypes.STRING(24), field: 'created_by_id' },
    },
    { tableName: 'sales' },
  );
};
