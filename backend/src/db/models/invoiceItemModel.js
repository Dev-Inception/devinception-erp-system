const { DataTypes, money, quantity, defineModel } = require('./helpers');

module.exports = (db) =>
  defineModel(
    db,
    'InvoiceItem',
    {
      id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
      invoiceId: { type: DataTypes.STRING(24), allowNull: false, field: 'invoice_id' },
      position: { type: DataTypes.INTEGER, allowNull: false },
      product: { type: DataTypes.STRING(24), allowNull: false, field: 'product_id' },
      name: { type: DataTypes.STRING(160), allowNull: false },
      quantity: quantity({ defaultValue: undefined }),
      unitCost: money({ defaultValue: undefined }),
      taxPercent: { type: DataTypes.DECIMAL(9, 4), allowNull: false, defaultValue: 0 },
      tax: money(),
      lineTotal: money({ defaultValue: undefined }),
    },
    { tableName: 'invoice_items', timestamps: false },
  );
