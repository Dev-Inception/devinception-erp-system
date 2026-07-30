const { DataTypes, id, defineModel } = require('./helpers');

module.exports = (db) =>
  defineModel(
    db,
    'Role',
    {
      id: id(),
      name: { type: DataTypes.STRING(80), allowNull: false },
      description: { type: DataTypes.STRING(200), allowNull: false, defaultValue: '' },
      permissions: { type: DataTypes.ARRAY(DataTypes.TEXT), allowNull: false, defaultValue: [] },
      isSystem: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    },
    { tableName: 'roles' },
  );
