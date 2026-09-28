const { DataTypes } = require('sequelize');
const { id, money, defineModel } = require('./helpers');

module.exports = function defineCustomer(db) {
  return defineModel(
    db,
    'Customer',
    {
      id: id(),
      name: { type: DataTypes.STRING(120), allowNull: false },
      phone: { type: DataTypes.STRING(30), allowNull: false, defaultValue: '' },
      email: { type: DataTypes.STRING(120), allowNull: false, defaultValue: '' },
      address: { type: DataTypes.STRING(300), allowNull: false, defaultValue: '' },
      store: { type: DataTypes.STRING(24), field: 'store_id' },
      creditLimit: money(),
      outstanding: money(),
    },
    { tableName: 'customers' },
  );
};
