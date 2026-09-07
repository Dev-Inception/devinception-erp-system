const { DataTypes } = require('sequelize');
const { id, money, defineModel } = require('./helpers');

module.exports = function defineStockReceipt(db) {
  return defineModel(
    db,
    'StockReceipt',
    {
      id: id(),
      number: { type: DataTypes.STRING(40), allowNull: false },
      supplier: { type: DataTypes.STRING(24), allowNull: false, field: 'supplier_id' },
      supplierName: { type: DataTypes.STRING(120), allowNull: false, defaultValue: '' },
      store: { type: DataTypes.STRING(24), allowNull: false, field: 'store_id' },
      warehouse: { type: DataTypes.STRING(24), allowNull: false, field: 'warehouse_id' },
      date: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
      isOpeningStock: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      truckVehicleNumber: { type: DataTypes.STRING(80), allowNull: false, defaultValue: '' },
      truckDriverName: { type: DataTypes.STRING(120), allowNull: false, defaultValue: '' },
      truckDriverPhone: { type: DataTypes.STRING(40), allowNull: false, defaultValue: '' },
      transporter: { type: DataTypes.STRING(24), field: 'transporter_id' },
      truckFare: money(),
      truckFarePaidBy: {
        type: DataTypes.STRING(10),
        allowNull: false,
        defaultValue: 'SUPPLIER',
        validate: { isIn: [['SUPPLIER', 'US']] },
      },
      truckFareMethod: { type: DataTypes.STRING(30) },
      truckFareBankAccount: { type: DataTypes.STRING(24), field: 'truck_fare_bank_account_id' },
      labourRent: money(),
      note: { type: DataTypes.STRING(500), allowNull: false, defaultValue: '' },
      additionalPaidAmount: money(),
      createdBy: { type: DataTypes.STRING(24), field: 'created_by_id' },
      gatePass: { type: DataTypes.STRING(24), field: 'gate_pass_id' },
    },
    { tableName: 'stock_receipts' },
  );
};
