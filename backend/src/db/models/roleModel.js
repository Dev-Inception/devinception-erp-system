const { DataTypes } = require('sequelize');
const { id, defineModel } = require('./helpers');

module.exports = function defineRole(db) {
  return defineModel(
    db,
    'Role',
    {
      id: id(),
      name: { type: DataTypes.STRING(100), allowNull: false },
      description: { type: DataTypes.STRING(200), allowNull: false, defaultValue: '' },
      permissions: { type: DataTypes.ARRAY(DataTypes.TEXT), allowNull: false, defaultValue: [] },
      isSystem: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    },
    { tableName: 'roles' },
  );
};
