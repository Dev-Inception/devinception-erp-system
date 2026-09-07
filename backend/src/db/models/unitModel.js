const { DataTypes } = require('sequelize');
const { id, defineModel } = require('./helpers');

module.exports = function defineUnit(db) {
  return defineModel(
    db,
    'Unit',
    {
      id: id(),
      name: { type: DataTypes.STRING(40), allowNull: false },
      abbreviation: { type: DataTypes.STRING(20), allowNull: false, defaultValue: '' },
      isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    },
    { tableName: 'units' },
  );
};
