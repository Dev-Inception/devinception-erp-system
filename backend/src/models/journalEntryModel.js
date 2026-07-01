const mongoose = require('mongoose');
const { ACCOUNT_KINDS, REF } = require('../utils/finance');

/**
 * A single, immutable journal entry — the atomic unit of the double-entry
 * ledger. All of its balanced debit/credit lines live in one document, so a
 * post is a single atomic write (no multi-document transaction needed, which
 * matters on a standalone MongoDB) and the entry can never be left half-posted.
 *
 * Amounts are integer paisa. Each line must have exactly one of debit/credit
 * non-zero, and across the whole entry SUM(debit) === SUM(credit).
 *
 * Entries are append-only: corrections are made by posting a reversing entry,
 * never by editing. There is deliberately no update/delete path in the service.
 */
const lineSchema = new mongoose.Schema(
  {
    // Which account this line hits. `ref` points at the Customer/Vendor/Bank
    // for AR/AP/BANK kinds; it is null for the singleton accounts.
    account: { type: String, enum: ACCOUNT_KINDS, required: true },
    ref: { type: mongoose.Schema.Types.ObjectId, default: null },
    debit: { type: Number, default: 0, min: 0 }, // paisa
    credit: { type: Number, default: 0, min: 0 }, // paisa
  },
  { _id: false },
);

const journalEntrySchema = new mongoose.Schema(
  {
    // Effective accounting date (may differ from createdAt).
    date: { type: Date, required: true, default: Date.now, index: true },
    description: { type: String, trim: true, default: '' },

    // Source document this entry was generated from.
    refType: { type: String, enum: Object.values(REF), required: true, index: true },
    refId: { type: mongoose.Schema.Types.ObjectId, default: null },
    refNo: { type: String, trim: true, default: '', index: true },

    lines: {
      type: [lineSchema],
      validate: {
        validator(lines) {
          if (!lines || lines.length < 2) return false;
          let debit = 0;
          let credit = 0;
          for (const l of lines) {
            // Exactly one side per line must be positive.
            const d = l.debit || 0;
            const c = l.credit || 0;
            if ((d > 0 && c > 0) || (d === 0 && c === 0)) return false;
            debit += d;
            credit += c;
          }
          return debit === credit;
        },
        message: 'Journal lines must be balanced (sum of debits === credits)',
      },
    },

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true },
);

// Common lookups: a party/account statement and per-account aggregation.
journalEntrySchema.index({ 'lines.account': 1, 'lines.ref': 1, date: 1 });

journalEntrySchema.set('toJSON', {
  transform: (_doc, ret) => {
    delete ret.__v;
    return ret;
  },
});

module.exports = mongoose.model('JournalEntry', journalEntrySchema);
