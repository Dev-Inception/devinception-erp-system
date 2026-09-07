const { DataTypes } = require('sequelize');
const { id, defineModel } = require('./helpers');

module.exports = function defineCategory(db) {
  return defineModel(
    db,
    'Category',
    {
      id: id(),
      name: { type: DataTypes.STRING(80), allowNull: false },
      description: { type: DataTypes.STRING(500), allowNull: false, defaultValue: '' },
      isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    },
    { tableName: 'categories' },
  );
};
