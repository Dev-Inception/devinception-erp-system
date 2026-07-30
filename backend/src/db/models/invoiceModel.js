const { DataTypes, id, money, defineModel } = require('./helpers');

module.exports = (db) =>
  defineModel(
    db,
    'Invoice',
    {
      id: id(),
      type: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'PURCHASE' },
      purchase: { type: DataTypes.STRING(24), allowNull: false, field: 'purchase_id' },
      number: { type: DataTypes.STRING(100), allowNull: false, unique: true },
      vendorInvoiceNo: { type: DataTypes.STRING(100), allowNull: false, defaultValue: '' },
      vendor: { type: DataTypes.STRING(24), allowNull: false, field: 'vendor_id' },
      vendorName: { type: DataTypes.STRING(120), allowNull: false, defaultValue: '' },
      warehouse: { type: DataTypes.STRING(24), allowNull: false, field: 'warehouse_id' },
      date: { type: DataTypes.DATE, allowNull: false },
      subtotal: money({ defaultValue: undefined }),
      discount: money(),
      tax: money(),
      total: money({ defaultValue: undefined }),
      paid: money(),
      balance: money(),
      status: {
        type: DataTypes.ENUM('UNPAID', 'PARTIAL', 'PAID'),
        allowNull: false,
        defaultValue: 'UNPAID',
      },
      notes: { type: DataTypes.TEXT, allowNull: false, defaultValue: '' },
      createdBy: { type: DataTypes.STRING(24), field: 'created_by_id' },
      gatePass: { type: DataTypes.STRING(24), field: 'gate_pass_id' },
    },
    { tableName: 'invoices' },
  );
