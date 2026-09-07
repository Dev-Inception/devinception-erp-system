const { DataTypes } = require('sequelize');
const { id, defineModel } = require('./helpers');

module.exports = function defineBrand(db) {
  return defineModel(
    db,
    'Brand',
    {
      id: id(),
      name: { type: DataTypes.STRING(80), allowNull: false },
      isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    },
    { tableName: 'brands' },
  );
};
