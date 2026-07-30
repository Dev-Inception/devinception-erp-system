const { DataTypes, id, defineModel } = require('./helpers');

module.exports = (db) =>
  defineModel(
    db,
    'Labour',
    {
      id: id(),
      name: { type: DataTypes.STRING(100), allowNull: false },
      phoneNumber: { type: DataTypes.STRING(15), allowNull: false, unique: true },
    },
    { tableName: 'labour' },
  );
