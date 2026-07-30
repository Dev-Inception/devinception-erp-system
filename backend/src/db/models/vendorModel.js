const { DataTypes, id, money, defineModel } = require('./helpers');

module.exports = (db) =>
  defineModel(
    db,
    'Vendor',
    {
      id: id(),
      name: { type: DataTypes.STRING(120), allowNull: false },
      phone: { type: DataTypes.STRING(30), allowNull: false, defaultValue: '' },
      email: { type: DataTypes.STRING(120), allowNull: false, defaultValue: '' },
      ntn: { type: DataTypes.STRING(40), allowNull: false, defaultValue: '' },
      address: { type: DataTypes.STRING(300), allowNull: false, defaultValue: '' },
      outstanding: money(),
    },
    { tableName: 'vendors' },
  );
