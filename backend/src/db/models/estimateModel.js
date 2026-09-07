const { DataTypes, id, money, defineModel } = require('./helpers');

module.exports = (db) =>
  defineModel(
    db,
    'Estimate',
    {
      id: id(),
      number: { type: DataTypes.STRING(100), allowNull: false, unique: true },
      customer: { type: DataTypes.STRING(24), field: 'customer_id' },
      customerName: { type: DataTypes.STRING(120), allowNull: false },
      customerPhone: { type: DataTypes.STRING(40), allowNull: false, defaultValue: '' },
      customerAddress: { type: DataTypes.STRING(240), allowNull: false, defaultValue: '' },
      store: { type: DataTypes.STRING(24), allowNull: false, field: 'store_id' },
      date: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
      subtotal: money({ defaultValue: undefined }),
      discount: money(),
      taxPercent: { type: DataTypes.DECIMAL(9, 4), allowNull: false, defaultValue: 0 },
      tax: money(),
      total: money({ defaultValue: undefined }),
      notes: { type: DataTypes.TEXT, allowNull: false, defaultValue: '' },
      status: { type: DataTypes.STRING(16), allowNull: false, defaultValue: 'PENDING' },
      nextFollowUpDate: DataTypes.DATE,
      lostReason: { type: DataTypes.STRING(500), allowNull: false, defaultValue: '' },
      convertedSale: { type: DataTypes.STRING(24), field: 'converted_sale_id' },
      convertedAt: DataTypes.DATE,
      createdBy: { type: DataTypes.STRING(24), field: 'created_by_id' },
    },
    { tableName: 'estimates' },
  );
