const { DataTypes } = require('sequelize');
const { id, money, defineModel } = require('./helpers');

// Private per-cashier POS scratch state. Never joined/aggregated in SQL, so
// items/labour/customer/driver stay as JSONB rather than normalized tables.
module.exports = function defineSaleDraft(db) {
  return defineModel(
    db,
    'SaleDraft',
    {
      id: id(),
      createdBy: { type: DataTypes.STRING(24), allowNull: false, field: 'created_by_id' },
      store: { type: DataTypes.STRING(24), field: 'store_id' },
      step: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 1,
        validate: { min: 1, max: 5 },
      },
      customer: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
      items: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
      labour: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
      driver: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
      transportFare: money(),
      discountValue: money(),
      discountType: {
        type: DataTypes.STRING(10),
        allowNull: false,
        defaultValue: 'amount',
        validate: { isIn: [['amount', 'percent']] },
      },
      taxPct: {
        type: DataTypes.DECIMAL(9, 4),
        allowNull: false,
        defaultValue: 0,
        validate: { min: 0 },
      },
      advanceAmount: money(),
    },
    { tableName: 'sale_drafts' },
  );
};
