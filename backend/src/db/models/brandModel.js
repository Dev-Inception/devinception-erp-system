const { DataTypes } = require('sequelize');
const { id, defineModel } = require('./helpers');

module.exports = function defineBrand(db) {
  return defineModel(
    db,
    'Brand',
    {
      id: id(),
      name: { type: DataTypes.STRING(80), allowNull: false },
      store: { type: DataTypes.STRING(24), field: 'store_id' },
      isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    },
    { tableName: 'brands' },
  );
};
