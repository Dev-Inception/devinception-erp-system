const { DataTypes } = require('sequelize');
const { defineModel } = require('./helpers');

module.exports = function defineCounter(db) {
  return defineModel(
    db,
    'Counter',
    {
      key: { type: DataTypes.STRING(30), primaryKey: true },
      scope: { type: DataTypes.STRING(30), primaryKey: true, defaultValue: '' },
      seq: { type: DataTypes.BIGINT, allowNull: false, defaultValue: 0 },
    },
    { tableName: 'counters', timestamps: false },
  );
};
