const { REF } = require('../../utils/finance');
const { DataTypes, id, defineModel } = require('./helpers');

module.exports = (db) =>
  defineModel(
    db,
    'JournalEntry',
    {
      id: id(),
      date: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
      description: { type: DataTypes.TEXT, allowNull: false, defaultValue: '' },
      refType: {
        type: DataTypes.STRING(30),
        allowNull: false,
        validate: { isIn: [Object.values(REF)] },
      },
      refId: DataTypes.STRING(24),
      refNo: { type: DataTypes.STRING(100), allowNull: false, defaultValue: '' },
      warehouse: { type: DataTypes.STRING(24), field: 'warehouse_id' },
      store: { type: DataTypes.STRING(24), field: 'store_id' },
      createdBy: { type: DataTypes.STRING(24), field: 'created_by_id' },
    },
    { tableName: 'journal_entries' },
  );
