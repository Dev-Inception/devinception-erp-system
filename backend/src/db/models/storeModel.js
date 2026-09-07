const { DataTypes } = require('sequelize');
const { id, defineModel } = require('./helpers');

module.exports = function defineStore(db) {
  return defineModel(
    db,
    'Store',
    {
      id: id(),
      name: { type: DataTypes.STRING(120), allowNull: false },
      code: { type: DataTypes.STRING(20), allowNull: false, defaultValue: '' },
      address: { type: DataTypes.STRING(300), allowNull: false, defaultValue: '' },
      isDefault: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    },
    { tableName: 'stores' },
  );
};
