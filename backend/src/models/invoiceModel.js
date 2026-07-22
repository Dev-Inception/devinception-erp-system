const mongoose = require('mongoose');

/**
 * Persisted vendor invoice generated from one GoodsPurchase. The purchase
 * remains the inventory/accounting source document; this record is the stable
 * invoice snapshot used for listing, payment status, and PDF downloads.
 */
const invoiceItemSchema = new mongoose.Schema(
  {
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    name: { type: String, required: true },
    quantity: { type: Number, required: true, min: 0 },
    unitCost: { type: Number, required: true, min: 0 },
    taxPercent: { type: Number, default: 0, min: 0 },
    tax: { type: Number, default: 0, min: 0 },
    lineTotal: { type: Number, required: true, min: 0 },
  },
  { _id: false },
);

const invoiceSchema = new mongoose.Schema(
  {
    type: { type: String, enum: ['PURCHASE'], default: 'PURCHASE', required: true, index: true },
    purchase: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'GoodsPurchase',
      required: true,
    },
    number: { type: String, required: true, unique: true },
    vendorInvoiceNo: { type: String, trim: true, default: '' },
    vendor: { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor', required: true, index: true },
    vendorName: { type: String, trim: true, default: '' },
    warehouse: { type: mongoose.Schema.Types.ObjectId, ref: 'Warehouse', required: true },
    date: { type: Date, required: true, index: true },
    items: { type: [invoiceItemSchema], required: true },
    subtotal: { type: Number, required: true, min: 0 },
    discount: { type: Number, default: 0, min: 0 },
    tax: { type: Number, default: 0, min: 0 },
    total: { type: Number, required: true, min: 0 },
    paid: { type: Number, default: 0, min: 0 },
    balance: { type: Number, default: 0, min: 0 },
    status: {
      type: String,
      enum: ['UNPAID', 'PARTIAL', 'PAID'],
      default: 'UNPAID',
      index: true,
    },
    notes: { type: String, trim: true, default: '' },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    gatePass: { type: mongoose.Schema.Types.ObjectId, ref: 'GatePass', default: null },
  },
  { timestamps: true },
);

// A partial index lets this purchase-only model coexist safely with any legacy
// invoice documents that do not have a purchase reference.
invoiceSchema.index(
  { purchase: 1 },
  {
    unique: true,
    partialFilterExpression: { type: 'PURCHASE', purchase: { $type: 'objectId' } },
  },
);

invoiceSchema.set('toJSON', {
  transform: (_doc, ret) => {
    delete ret.__v;
    return ret;
  },
});

module.exports = mongoose.model('Invoice', invoiceSchema);
