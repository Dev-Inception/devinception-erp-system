const { DataTypes } = require('sequelize');
const { id, defineModel } = require('./helpers');

module.exports = function defineLabour(db) {
  return defineModel(
    db,
    'Labour',
    {
      id: id(),
      name: { type: DataTypes.STRING(100), allowNull: false, validate: { len: [2, 100] } },
      phoneNumber: { type: DataTypes.STRING(20), allowNull: false },
    },
    { tableName: 'labour' },
  );
};
