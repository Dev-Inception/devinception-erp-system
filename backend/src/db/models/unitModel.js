const { DataTypes, id, defineModel } = require('./helpers');

module.exports = (db) =>
  defineModel(
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
