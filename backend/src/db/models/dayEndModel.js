const { DataTypes, id, defineModel } = require('./helpers');

module.exports = (db) =>
  defineModel(
    db,
    'DayEnd',
    {
      id: id(),
      store: { type: DataTypes.STRING(24), allowNull: false, field: 'store_id' },
      date: { type: DataTypes.DATEONLY, allowNull: false },
      closedBy: { type: DataTypes.STRING(24), allowNull: false, field: 'closed_by_id' },
      closedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
      reopenedBy: { type: DataTypes.STRING(24), field: 'reopened_by_id' },
      reopenedAt: DataTypes.DATE,
    },
    { tableName: 'day_ends' },
  );
