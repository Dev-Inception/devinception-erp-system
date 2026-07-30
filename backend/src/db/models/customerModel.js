const { DataTypes, id, money, defineModel } = require('./helpers');

module.exports = (db) =>
  defineModel(
    db,
    'Customer',
    {
      id: id(),
      name: { type: DataTypes.STRING(120), allowNull: false },
      phone: { type: DataTypes.STRING(30), allowNull: false, defaultValue: '' },
      email: { type: DataTypes.STRING(120), allowNull: false, defaultValue: '' },
      address: { type: DataTypes.STRING(300), allowNull: false, defaultValue: '' },
      creditLimit: money(),
      outstanding: money(),
    },
    { tableName: 'customers' },
  );
