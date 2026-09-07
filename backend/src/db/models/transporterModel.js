const { DataTypes } = require('sequelize');
const { id, money, defineModel } = require('./helpers');

module.exports = function defineTransporter(db) {
  return defineModel(
    db,
    'Transporter',
    {
      id: id(),
      name: { type: DataTypes.STRING(120), allowNull: false },
      phone: { type: DataTypes.STRING(30), allowNull: false, defaultValue: '' },
      vehicleNumber: { type: DataTypes.STRING(40), allowNull: false, defaultValue: '' },
      address: { type: DataTypes.STRING(300), allowNull: false, defaultValue: '' },
      outstanding: money(),
    },
    { tableName: 'transporters' },
  );
};
