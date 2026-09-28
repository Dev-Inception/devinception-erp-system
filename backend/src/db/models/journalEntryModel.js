const { DataTypes } = require('sequelize');
const { id, defineModel } = require('./helpers');
const { REF } = require('../../utils/finance');

module.exports = function defineJournalEntry(db) {
  return defineModel(
    db,
    'JournalEntry',
    {
      id: id(),
      date: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
      description: { type: DataTypes.STRING(500), allowNull: false, defaultValue: '' },
      refType: {
        type: DataTypes.STRING(30),
        allowNull: false,
        field: 'ref_type',
        validate: { isIn: [Object.values(REF)] },
      },
      refId: { type: DataTypes.STRING(24), field: 'ref_id' },
      refNo: { type: DataTypes.STRING(100), allowNull: false, defaultValue: '', field: 'ref_no' },
      warehouse: { type: DataTypes.STRING(24), field: 'warehouse_id' },
      store: { type: DataTypes.STRING(24), field: 'store_id' },
      createdBy: { type: DataTypes.STRING(24), field: 'created_by_id' },
    },
    { tableName: 'journal_entries' },
  );
};
