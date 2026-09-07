const { PAYMENT_METHOD } = require('../../utils/finance');
const { DataTypes, id, money, defineModel } = require('./helpers');
const EXPENSE_METHODS = [
  PAYMENT_METHOD.CASH,
  PAYMENT_METHOD.CARD,
  PAYMENT_METHOD.BANK_TRANSFER,
  PAYMENT_METHOD.ONLINE,
];
const EXPENSE_STATUS = { PENDING: 'PENDING', APPROVED: 'APPROVED', REJECTED: 'REJECTED' };
module.exports = (db) => {
  const Expense = defineModel(
    db,
    'Expense',
    {
      id: id(),
      number: { type: DataTypes.STRING(100), allowNull: false, unique: true },
      category: { type: DataTypes.STRING(24), allowNull: false, field: 'category_id' },
      categoryName: { type: DataTypes.STRING(80), allowNull: false },
      amount: money({ defaultValue: undefined }),
      method: { type: DataTypes.STRING(30), allowNull: false },
      bankAccount: { type: DataTypes.STRING(24), field: 'bank_account_id' },
      store: { type: DataTypes.STRING(24), allowNull: false, field: 'store_id' },
      warehouse: { type: DataTypes.STRING(24), field: 'warehouse_id' },
      date: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
      note: { type: DataTypes.STRING(500), allowNull: false, defaultValue: '' },
      status: { type: DataTypes.STRING(12), allowNull: false, defaultValue: 'PENDING' },
      approvedBy: { type: DataTypes.STRING(24), field: 'approved_by_id' },
      approvedAt: DataTypes.DATE,
      rejectedBy: { type: DataTypes.STRING(24), field: 'rejected_by_id' },
      rejectedAt: DataTypes.DATE,
      rejectionReason: { type: DataTypes.STRING(500), allowNull: false, defaultValue: '' },
      journalEntry: { type: DataTypes.STRING(24), field: 'journal_entry_id' },
      createdBy: { type: DataTypes.STRING(24), field: 'created_by_id' },
    },
    { tableName: 'expenses' },
  );
  Expense.EXPENSE_METHODS = EXPENSE_METHODS;
  Expense.EXPENSE_STATUS = EXPENSE_STATUS;
  return Expense;
};
