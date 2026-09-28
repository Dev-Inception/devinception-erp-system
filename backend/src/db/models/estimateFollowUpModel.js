const { DataTypes } = require('sequelize');
const { defineModel } = require('./helpers');

module.exports = function defineEstimateFollowUp(db) {
  return defineModel(
    db,
    'EstimateFollowUp',
    {
      id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
      estimateId: { type: DataTypes.STRING(24), allowNull: false, field: 'estimate_id' },
      position: { type: DataTypes.INTEGER, allowNull: false },
      date: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
      note: { type: DataTypes.STRING(500), allowNull: false },
      by: { type: DataTypes.STRING(24), field: 'by_id' },
    },
    { tableName: 'estimate_follow_ups', timestamps: false },
  );
};
