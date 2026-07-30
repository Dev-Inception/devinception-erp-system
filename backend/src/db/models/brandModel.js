const { DataTypes, id, defineModel } = require('./helpers');

module.exports = (db) =>
  defineModel(
    db,
    'Brand',
    {
      id: id(),
      name: { type: DataTypes.STRING(80), allowNull: false },
      isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    },
    { tableName: 'brands' },
  );
