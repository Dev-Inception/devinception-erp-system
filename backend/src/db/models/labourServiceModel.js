const { DataTypes } = require('sequelize');
const { id, defineModel } = require('./helpers');

module.exports = function defineLabourService(db) {
  return defineModel(
    db,
    'LabourService',
    {
      id: id(),
      name: { type: DataTypes.STRING(80), allowNull: false },
      description: { type: DataTypes.STRING(500), allowNull: false, defaultValue: '' },
      store: { type: DataTypes.STRING(24), field: 'store_id' },
      isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    },
    { tableName: 'labour_services' },
  );
};
