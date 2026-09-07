const { DataTypes, id, money, defineModel } = require('./helpers');
module.exports = (db) =>
  defineModel(
    db,
    'SaleDraft',
    {
      id: id(),
      createdBy: { type: DataTypes.STRING(24), allowNull: false, field: 'created_by_id' },
      store: { type: DataTypes.STRING(24), field: 'store_id' },
      step: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
      customer: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
      items: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
      labour: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
      driver: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
      transportFare: money(),
      discountValue: money(),
      discountType: { type: DataTypes.STRING(10), allowNull: false, defaultValue: 'amount' },
      taxPct: { type: DataTypes.DECIMAL(9, 4), allowNull: false, defaultValue: 0 },
      advanceAmount: money(),
    },
    { tableName: 'sale_drafts' },
  );
