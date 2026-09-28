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
    },
    { tableName: 'expense_categories' },
  );
};
