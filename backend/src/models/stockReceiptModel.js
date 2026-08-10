const mongoose = require('mongoose');

/**
 * A truck delivery of goods from a vendor into a warehouse. Each line records
 * how much of a product actually arrived in sellable condition
 * (`receivedQuantity`, which is added to stock) versus how much arrived
 * damaged (`damagedQuantity`, recorded for tracking/vendor claims only — it
 * is never added to stock). See stockReceiptService for the stock/ledger
 * effects.
 */
const stockReceiptItemSchema = new mongoose.Schema(
  {
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    name: { type: String, required: true }, // snapshot
    receivedQuantity: { type: Number, default: 0, min: 0 },
    damagedQuantity: { type: Number, default: 0, min: 0 },
  },
  { _id: false },
);

const stockReceiptTruckSchema = new mongoose.Schema(
  {
    vehicleNumber: { type: String, required: true, trim: true, maxlength: 80 },
    driverName: { type: String, trim: true, maxlength: 120, default: '' },
    driverPhone: { type: String, trim: true, maxlength: 40, default: '' },
  },
  { _id: false },
);

const stockReceiptSchema = new mongoose.Schema(
  {
    number: { type: String, required: true, unique: true }, // GRN-2026-000001
    vendor: { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor', required: true, index: true },
    vendorName: { type: String, default: '' }, // snapshot
    warehouse: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Warehouse',
      required: true,
      index: true,
    },
    date: { type: Date, default: Date.now, index: true },
    truck: { type: stockReceiptTruckSchema, required: true },
    items: { type: [stockReceiptItemSchema], required: true },
    note: { type: String, trim: true, maxlength: 500, default: '' },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true },
);

stockReceiptSchema.set('toJSON', {
  transform: (_doc, ret) => {
    delete ret.__v;
    return ret;
  },
});

module.exports = mongoose.model('StockReceipt', stockReceiptSchema);
