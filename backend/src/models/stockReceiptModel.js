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

// Labour who helped unload/receive this delivery, with their own per-job
// charge — same shape as saleLabourSchema (see saleModel.js). Posts as a
// payable to the labourer immediately (see stockReceiptService), same as a
// sale's labour charge.
const stockReceiptLabourSchema = new mongoose.Schema(
  {
    labour: { type: mongoose.Schema.Types.ObjectId, ref: 'Labour', required: true },
    name: { type: String, required: true },
    phoneNumber: { type: String, default: '' },
    rent: { type: Number, default: 0, min: 0 }, // paisa
  },
  { _id: false },
);

const stockReceiptSchema = new mongoose.Schema(
  {
    number: { type: String, required: true, unique: true }, // GRN-2026-000001
    vendor: { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor', required: true, index: true },
    vendorName: { type: String, default: '' }, // snapshot
    // The physical storefront this delivery was received for — set once at
    // creation from whichever store was selected. Distinct from `warehouse`
    // below (where the stock physically landed).
    store: { type: mongoose.Schema.Types.ObjectId, ref: 'Store', required: true, index: true },
    warehouse: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Warehouse',
      required: true,
      index: true,
    },
    date: { type: Date, default: Date.now, index: true },
    truck: { type: stockReceiptTruckSchema, required: true },
    // What the truck delivery cost, and who covered it. SUPPLIER means the
    // vendor already bore this cost — informational only, no journal entry.
    // US means we paid the driver at receiving time — posted immediately as
    // an operating expense (see stockReceiptService), never deferred.
    truckFare: { type: Number, default: 0, min: 0 }, // paisa
    truckFarePaidBy: { type: String, enum: ['SUPPLIER', 'US'], default: 'SUPPLIER' },
    // Snapshot of how the fare was settled, only set when truckFarePaidBy
    // is 'US' — needed to reverse the exact same journal entry on edit/delete.
    truckFareMethod: { type: String, default: null },
    truckFareBankAccount: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'BankAccount',
      default: null,
    },
    items: { type: [stockReceiptItemSchema], required: true },
    labour: { type: [stockReceiptLabourSchema], default: [] },
    labourRent: { type: Number, default: 0, min: 0 }, // paisa, sum of labour[].rent
    note: { type: String, trim: true, maxlength: 500, default: '' },
    // Paid to the vendor against this specific receipt's priced items so
    // far (see stockReceiptService.recordPayment) — paisa. "Amount owed" is
    // never stored here; it's derived from PendingEntity (pricedTotalsByStockReceipt)
    // minus this, the same way Sale.additionalPaidAmount works for AR.
    additionalPaidAmount: { type: Number, default: 0, min: 0 },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    // "Goods coming in" gate pass documenting this delivery's received
    // quantities — see gatePassService.createForReceipt.
    gatePass: { type: mongoose.Schema.Types.ObjectId, ref: 'GatePass', default: null },
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
