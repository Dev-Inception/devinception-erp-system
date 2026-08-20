const mongoose = require('mongoose');
const { PAYMENT_METHOD } = require('../utils/finance');

// An expense settles immediately out of cash/bank — MIXED (split) and CREDIT
// (on account) don't apply the way they do to a sale.
const EXPENSE_METHODS = [
  PAYMENT_METHOD.CASH,
  PAYMENT_METHOD.CARD,
  PAYMENT_METHOD.BANK_TRANSFER,
  PAYMENT_METHOD.ONLINE,
];

// A super admin's own entry is auto-approved; everyone else's spend sits
// PENDING — with no journal effect yet — until a super admin approves or
// rejects it. See expenseService.createExpense/approveExpense.
const EXPENSE_STATUS = {
  PENDING: 'PENDING',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
};

/**
 * A day-to-day operating expense — lunch for staff, a fixed office chair, the
 * electricity bill, and so on. Unlike a JournalEntry (append-only, no edit or
 * delete path — see journalEntryModel.js), this is a normal mutable record so
 * a mistyped amount or wrong category can actually be fixed. Each create/
 * edit/delete posts a balanced journal entry to keep the books in sync — see
 * expenseService, which mirrors paymentService.recordExpense's Dr Operating
 * Expense / Cr Cash|Bank posting. That posting only happens once the expense
 * is APPROVED — see EXPENSE_STATUS above.
 */
const expenseSchema = new mongoose.Schema(
  {
    number: { type: String, required: true, unique: true, index: true }, // EXP-2026-000001
    category: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ExpenseCategory',
      required: true,
      index: true,
    },
    categoryName: { type: String, required: true, trim: true }, // snapshot
    amount: { type: Number, required: true, min: 0 }, // paisa
    method: { type: String, enum: EXPENSE_METHODS, required: true },
    bankAccount: { type: mongoose.Schema.Types.ObjectId, ref: 'BankAccount', default: null },
    store: { type: mongoose.Schema.Types.ObjectId, ref: 'Store', required: true, index: true },
    // Optional — lets a warehouse-scoped P&L pick up expenses attributable
    // to that specific location (e.g. that branch's electricity bill).
    warehouse: { type: mongoose.Schema.Types.ObjectId, ref: 'Warehouse', default: null },
    date: { type: Date, default: Date.now, index: true },
    note: { type: String, trim: true, maxlength: 500, default: '' },
    status: {
      type: String,
      enum: Object.values(EXPENSE_STATUS),
      default: EXPENSE_STATUS.PENDING,
      index: true,
    },
    approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    approvedAt: { type: Date, default: null },
    rejectedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    rejectedAt: { type: Date, default: null },
    rejectionReason: { type: String, trim: true, maxlength: 500, default: '' },
    // The journal entry currently backing this expense's ledger effect (only
    // set once APPROVED) — an edit reverses this one and posts a fresh one,
    // updating the pointer.
    journalEntry: { type: mongoose.Schema.Types.ObjectId, ref: 'JournalEntry', default: null },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true },
);

expenseSchema.set('toJSON', {
  transform: (_doc, ret) => {
    delete ret.__v;
    return ret;
  },
});

const Expense = mongoose.model('Expense', expenseSchema);
// Attached so the validator/service can reuse these without duplicating them
// (the model constructor is a function, so this is a safe place to hang
// related constants other modules destructure from it).
Expense.EXPENSE_METHODS = EXPENSE_METHODS;
Expense.EXPENSE_STATUS = EXPENSE_STATUS;

module.exports = Expense;
