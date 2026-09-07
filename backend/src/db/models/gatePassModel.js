const { DataTypes } = require('sequelize');
const { id, defineModel } = require('./helpers');

module.exports = function defineGatePass(db) {
  return defineModel(
    db,
    'GatePass',
    {
      id: id(),
      number: { type: DataTypes.STRING(40), allowNull: false },
      token: { type: DataTypes.STRING(64), allowNull: false },
      sourceType: {
        type: DataTypes.STRING(10),
        allowNull: false,
        defaultValue: 'SALE',
        field: 'source_type',
        validate: { isIn: [['SALE', 'RETURN', 'PURCHASE']] },
      },
      sale: { type: DataTypes.STRING(24), field: 'sale_id' },
      saleReturn: { type: DataTypes.STRING(24), field: 'sale_return_id' },
      stockReceipt: { type: DataTypes.STRING(24), field: 'stock_receipt_id' },
      kind: {
        type: DataTypes.STRING(10),
        allowNull: false,
        defaultValue: 'CUSTOMER',
        validate: { isIn: [['CUSTOMER', 'VENDOR']] },
      },
      documentNumber: { type: DataTypes.STRING(40), allowNull: false, field: 'document_number' },
      partyName: { type: DataTypes.STRING(120), allowNull: false, defaultValue: '' },
      store: { type: DataTypes.STRING(24), field: 'store_id' },
      warehouse: { type: DataTypes.STRING(24), allowNull: false, field: 'warehouse_id' },
      saleDate: { type: DataTypes.DATE, allowNull: false, field: 'sale_date' },
      status: {
        type: DataTypes.STRING(12),
        allowNull: false,
        defaultValue: 'PENDING',
        validate: { isIn: [['PENDING', 'PROCESSED', 'CANCELLED', 'ACTIVE', 'USED']] },
      },
      driverName: { type: DataTypes.STRING(120), field: 'driver_name' },
      driverPhone: { type: DataTypes.STRING(40), field: 'driver_phone' },
      driverLicenseNumber: { type: DataTypes.STRING(80), field: 'driver_license_number' },
      driverVehicleNumber: { type: DataTypes.STRING(80), field: 'driver_vehicle_number' },
      loadNotes: {
        type: DataTypes.STRING(1000),
        allowNull: false,
        defaultValue: '',
        field: 'load_notes',
      },
      signatureData: { type: DataTypes.TEXT, field: 'signature_data' },
      processedAt: { type: DataTypes.DATE, field: 'processed_at' },
      processedBy: { type: DataTypes.STRING(24), field: 'processed_by_id' },
      lastEditedAt: { type: DataTypes.DATE, field: 'last_edited_at' },
      lastEditedBy: { type: DataTypes.STRING(24), field: 'last_edited_by_id' },
      createdBy: { type: DataTypes.STRING(24), field: 'created_by_id' },
    },
    { tableName: 'gate_passes' },
  );
};
