const mongoose = require('mongoose');
const { PAYMENT_METHODS } = require('../utils/finance');

/**
 * A POS sale. Selling posts revenue (Dr Cash/Bank/Receivable, Cr Sales) and
 * cost of goods sold (Dr COGS, Cr Inventory), and lowers stock. `cashAmount`
 * and `onlineAmount` record how it was settled (a credit sale leaves the rest
 * as a receivable). All money is paisa; `cost` is the COGS captured at sale
 * time for the Profit & Loss report.
 */
const saleItemSchema = new mongoose.Schema(
  {
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    name: { type: String, required: true }, // snapshot
    quantity: { type: Number, required: true, min: 0 },
    unitPrice: { type: Number, required: true, min: 0 }, // paisa
    lineTotal: { type: Number, required: true, min: 0 }, // paisa
    cost: { type: Number, default: 0, min: 0 }, // COGS for the line (paisa)
  },
  { _id: false },
);

const saleLabourSchema = new mongoose.Schema(
  {
    labour: { type: mongoose.Schema.Types.ObjectId, ref: 'Labour', required: true },
    name: { type: String, required: true },
    phoneNumber: { type: String, default: '' },
  },
  { _id: false },
);

const saleSchema = new mongoose.Schema(
  {
    number: { type: String, required: true, unique: true, index: true }, // SALE-2026-000010
    customer: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', default: null, index: true },
    customerName: { type: String, default: 'Walk-in' }, // snapshot
    warehouse: { type: mongoose.Schema.Types.ObjectId, ref: 'Warehouse', required: true },
    date: { type: Date, default: Date.now, index: true },

    items: { type: [saleItemSchema], required: true },
    labour: { type: [saleLabourSchema], default: [] },

    subtotal: { type: Number, required: true, min: 0 }, // paisa, before discount
    discount: { type: Number, default: 0, min: 0 }, // paisa
    taxPercent: { type: Number, default: 0, min: 0 }, // % applied to net
    tax: { type: Number, default: 0, min: 0 }, // paisa, output tax
    total: { type: Number, required: true, min: 0 }, // paisa, payable (net + tax)
    cost: { type: Number, default: 0, min: 0 }, // total COGS (paisa)

    paymentMethod: { type: String, enum: PAYMENT_METHODS, required: true },
    cashAmount: { type: Number, default: 0, min: 0 }, // paisa settled in cash
    onlineAmount: { type: Number, default: 0, min: 0 }, // paisa settled to a bank
    creditAmount: { type: Number, default: 0, min: 0 }, // paisa left on account (AR)
    bankAccount: { type: mongoose.Schema.Types.ObjectId, ref: 'BankAccount', default: null },
    // Proof-of-transfer for any online/bank-settled portion (a URL or upload
    // reference). Required by the POS whenever money lands online.
    transferReceiptRef: { type: String, trim: true, default: '' },

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true },
);

saleSchema.set('toJSON', {
  transform: (_doc, ret) => {
    delete ret.__v;
    return ret;
  },
});

module.exports = mongoose.model('Sale', saleSchema);
