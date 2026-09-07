const { DataTypes } = require('sequelize');
const { id, defineModel } = require('./helpers');

module.exports = function defineDayEnd(db) {
  return defineModel(
    db,
    'DayEnd',
    {
      id: id(),
      store: { type: DataTypes.STRING(24), allowNull: false, field: 'store_id' },
      // Business calendar date ('YYYY-MM-DD'), stored as a plain SQL DATE
      // rather than the Mongo model's string — the app formats/parses it the
      // same way (see utils/reportDate.js).
      date: { type: DataTypes.DATEONLY, allowNull: false },
      closedBy: { type: DataTypes.STRING(24), allowNull: false, field: 'closed_by_id' },
      closedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
      reopenedBy: { type: DataTypes.STRING(24), field: 'reopened_by_id' },
      reopenedAt: { type: DataTypes.DATE },
    },
    { tableName: 'day_ends' },
  );
};
