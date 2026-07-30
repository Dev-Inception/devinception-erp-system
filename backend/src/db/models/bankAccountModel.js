const { DataTypes, id, defineModel } = require('./helpers');

module.exports = (db) =>
  defineModel(
    db,
    'BankAccount',
    {
      id: id(),
      name: { type: DataTypes.STRING(120), allowNull: false },
      bankName: { type: DataTypes.STRING(120), allowNull: false, defaultValue: '' },
      accountNumber: { type: DataTypes.STRING(60), allowNull: false, defaultValue: '' },
      isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    },
    { tableName: 'bank_accounts' },
  );
