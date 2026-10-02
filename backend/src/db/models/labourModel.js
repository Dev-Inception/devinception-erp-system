const { DataTypes } = require('sequelize');
const { id, defineModel } = require('./helpers');

module.exports = function defineLabour(db) {
  return defineModel(
    db,
    'Labour',
    {
      id: id(),
      name: { type: DataTypes.STRING(100), allowNull: false, validate: { len: [2, 100] } },
      // Optional — '' when a labourer is added with just a name.
      phoneNumber: { type: DataTypes.STRING(20), allowNull: false, defaultValue: '' },
      store: { type: DataTypes.STRING(24), allowNull: false, field: 'store_id' },
    },
    { tableName: 'labour' },
  );
};
