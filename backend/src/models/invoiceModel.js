const mongoose = require('mongoose');

/**
 * A customer invoice — a billing document raised against a customer's account.
 * Issuing it lowers stock and posts Dr Receivable / Cr Sales (+ Cr Tax), like a
 * credit sale, then payments are recorded against it until it is settled.
 * Status is derived from how much has been paid. All money is paisa.
 */
const invoiceItemSchema = new mongoose.Schema(
  {
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    name: { type: String, required: true },
    quantity: { type: Number, required: true, min: 0 },
    unitPrice: { type: Number, required: true, min: 0 }, // paisa
    lineTotal: { type: Number, required: true, min: 0 }, // paisa
    cost: { type: Number, default: 0, min: 0 }, // COGS (paisa)
  },
  { _id: false },
);

const invoiceSchema = new mongoose.Schema(
  {
    number: { type: String, required: true, unique: true, index: true }, // INV-2026-000001
    // The sale this invoice was raised from, when it is a sale-derived invoice
    // (the POS bills an existing sale). Null for stand-alone credit invoices.
    // Indexed via the partial-unique index below (one invoice per sale).
    sale: { type: mongoose.Schema.Types.ObjectId, ref: 'Sale', default: null },
    // Optional so a walk-in sale (no customer) can still be invoiced.
    customer: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', default: null, index: true },
    customerName: { type: String, required: true }, // snapshot
    warehouse: { type: mongoose.Schema.Types.ObjectId, ref: 'Warehouse', required: true },
    date: { type: Date, default: Date.now, index: true },
    dueDate: { type: Date, default: null },

    items: { type: [invoiceItemSchema], required: true },

    subtotal: { type: Number, required: true, min: 0 },
    discount: { type: Number, default: 0, min: 0 },
    taxPercent: { type: Number, default: 0, min: 0 },
    tax: { type: Number, default: 0, min: 0 },
    total: { type: Number, required: true, min: 0 },
    cost: { type: Number, default: 0, min: 0 },

    amountPaid: { type: Number, default: 0, min: 0 },
    balance: { type: Number, default: 0 }, // total - amountPaid
    status: { type: String, enum: ['UNPAID', 'PARTIAL', 'PAID'], default: 'UNPAID', index: true },

    notes: { type: String, trim: true, default: '' },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true },
);

// At most one invoice per sale, so creating one from a sale is idempotent.
// Partial so the many stand-alone invoices (sale = null) aren't forced unique.
invoiceSchema.index(
  { sale: 1 },
  { unique: true, partialFilterExpression: { sale: { $type: 'objectId' } } },
);

invoiceSchema.set('toJSON', {
  transform: (_doc, ret) => {
    delete ret.__v;
    return ret;
  },
});

module.exports = mongoose.model('Invoice', invoiceSchema);
