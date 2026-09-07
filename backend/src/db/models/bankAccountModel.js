const { DataTypes } = require('sequelize');
const { id, defineModel } = require('./helpers');

module.exports = function defineBankAccount(db) {
  return defineModel(
    db,
    'BankAccount',
    {
      id: id(),
      name: { type: DataTypes.STRING(120), allowNull: false },
      bankName: { type: DataTypes.STRING(120), allowNull: false, defaultValue: '' },
      accountNumber: { type: DataTypes.STRING(60), allowNull: false, defaultValue: '' },
      store: { type: DataTypes.STRING(24), field: 'store_id' },
      isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    },
    { tableName: 'bank_accounts' },
  );
};
