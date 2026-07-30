const { DataTypes, id, defineModel } = require('./helpers');

module.exports = (db) =>
  defineModel(
    db,
    'Settings',
    {
      id: id(),
      key: { type: DataTypes.STRING(30), allowNull: false, defaultValue: 'app', unique: true },
      companyName: { type: DataTypes.STRING(160), allowNull: false, defaultValue: '' },
      address: { type: DataTypes.STRING(300), allowNull: false, defaultValue: '' },
      phone: { type: DataTypes.STRING(30), allowNull: false, defaultValue: '' },
      email: { type: DataTypes.STRING(120), allowNull: false, defaultValue: '' },
      taxNumber: { type: DataTypes.STRING(60), allowNull: false, defaultValue: '' },
      currency: { type: DataTypes.STRING(10), allowNull: false, defaultValue: 'PKR' },
    },
    { tableName: 'settings' },
  );
