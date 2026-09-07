const { DataTypes } = require('sequelize');
const { id, defineModel } = require('./helpers');

module.exports = function defineSettings(db) {
  return defineModel(
    db,
    'Settings',
    {
      id: id(),
      key: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'app' },
      companyName: { type: DataTypes.STRING(200), allowNull: false, defaultValue: '' },
      address: { type: DataTypes.STRING(300), allowNull: false, defaultValue: '' },
      phone: { type: DataTypes.STRING(40), allowNull: false, defaultValue: '' },
      email: { type: DataTypes.STRING(120), allowNull: false, defaultValue: '' },
      taxNumber: { type: DataTypes.STRING(60), allowNull: false, defaultValue: '' },
      currency: { type: DataTypes.STRING(10), allowNull: false, defaultValue: 'PKR' },
      invoiceNote: { type: DataTypes.STRING(1000), allowNull: false, defaultValue: '' },
    },
    { tableName: 'settings' },
  );
};
