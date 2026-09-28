const { DataTypes } = require('sequelize');
const { money, defineModel } = require('./helpers');
const { ACCOUNT_KINDS } = require('../../utils/finance');

module.exports = function defineJournalLine(db) {
  return defineModel(
    db,
    'JournalLine',
    {
      id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
      journalEntryId: { type: DataTypes.STRING(24), allowNull: false, field: 'journal_entry_id' },
      position: { type: DataTypes.INTEGER, allowNull: false },
      account: {
        type: DataTypes.STRING(30),
        allowNull: false,
        validate: { isIn: [ACCOUNT_KINDS] },
      },
      ref: { type: DataTypes.STRING(24), field: 'ref_id' },
      debit: money(),
      credit: money(),
    },
    { tableName: 'journal_lines', timestamps: false },
  );
};
