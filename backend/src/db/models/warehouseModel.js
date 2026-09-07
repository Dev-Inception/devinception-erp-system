const { DataTypes } = require('sequelize');
const { id, defineModel } = require('./helpers');

module.exports = function defineWarehouse(db) {
  return defineModel(
    db,
    'Warehouse',
    {
      id: id(),
      name: { type: DataTypes.STRING(120), allowNull: false },
      location: { type: DataTypes.STRING(120), allowNull: false, defaultValue: '' },
      address: { type: DataTypes.STRING(300), allowNull: false, defaultValue: '' },
      isDefault: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    },
    { tableName: 'warehouses' },
  );
};
