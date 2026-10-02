const { DataTypes } = require('sequelize');
const { id, defineModel } = require('./helpers');

module.exports = function defineExpenseCategory(db) {
  return defineModel(
    db,
    'ExpenseCategory',
    {
      id: id(),
      name: { type: DataTypes.STRING(80), allowNull: false },
      description: { type: DataTypes.STRING(500), allowNull: false, defaultValue: '' },
      isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
      // 'LABOUR' / 'TRANSPORT' for the two built-in categories that pay out
      // against a sale invoice (see expenseService); null for the rest.
      systemKey: { type: DataTypes.STRING(20), field: 'system_key' },
    },
    { tableName: 'expense_categories' },
  );
};
