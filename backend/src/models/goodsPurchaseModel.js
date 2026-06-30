const mongoose = require('mongoose');
const { PAYMENT_METHODS } = require('../utils/finance');

/**
 * A goods purchase (GRN) from a vendor. Receiving the goods raises stock and
 * posts Dr Inventory / Cr Accounts-Payable; any amount paid at purchase time
 * posts a separate payment (Dr A/P, Cr Cash/Bank). All money is paisa.
 *
 * The document is a record of what happened — the journal entries it generated
 * are the financial source of truth, so this model is not edited after create.
 */
const purchaseItemSchema = new mongoose.Schema(
  {
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    name: { type: String, required: true }, // snapshot of product name
    quantity: { type: Number, required: true, min: 0 },
    unitCost: { type: Number, required: true, min: 0 }, // paisa per unit (net of discount)
    taxPercent: { type: Number, default: 0, min: 0 },
    tax: { type: Number, default: 0, min: 0 }, // paisa, input tax for the line
    lineTotal: { type: Number, required: true, min: 0 }, // paisa, net (excl tax)
  },
  { _id: false },
);

const goodsPurchaseSchema = new mongoose.Schema(
  {
    number: { type: String, required: true, unique: true, index: true }, // GP-2026-0002
    vendorInvoiceNo: { type: String, trim: true, default: '' }, // supplier's invoice number
    vendor: { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor', required: true, index: true },
    warehouse: { type: mongoose.Schema.Types.ObjectId, ref: 'Warehouse', required: true },
    date: { type: Date, default: Date.now, index: true },

    items: { type: [purchaseItemSchema], required: true },

    subtotal: { type: Number, default: 0, min: 0 }, // paisa, before discount
    discount: { type: Number, default: 0, min: 0 }, // paisa
    tax: { type: Number, default: 0, min: 0 }, // paisa, total input tax
    total: { type: Number, required: true, min: 0 }, // paisa, grand total (net + tax)
    paid: { type: Number, default: 0, min: 0 }, // paisa
    balance: { type: Number, default: 0 }, // paisa (total - paid)

    paymentMethod: { type: String, enum: PAYMENT_METHODS, default: undefined },
    bankAccount: { type: mongoose.Schema.Types.ObjectId, ref: 'BankAccount', default: null },

    notes: { type: String, trim: true, default: '' },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true },
);

goodsPurchaseSchema.set('toJSON', {
  transform: (_doc, ret) => {
    delete ret.__v;
    return ret;
  },
});

module.exports = mongoose.model('GoodsPurchase', goodsPurchaseSchema);
