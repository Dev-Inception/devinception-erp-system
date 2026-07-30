const { DataTypes } = require('./helpers');

module.exports = (db) =>
  db.define(
    'Counter',
    {
      key: { type: DataTypes.STRING(30), primaryKey: true },
      scope: { type: DataTypes.STRING(30), primaryKey: true, defaultValue: '' },
      seq: { type: DataTypes.BIGINT, allowNull: false, defaultValue: 0 },
    },
    { tableName: 'counters', timestamps: false, underscored: true },
  );
