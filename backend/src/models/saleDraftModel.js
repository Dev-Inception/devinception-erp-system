const mongoose = require('mongoose');

/**
 * A POS sale in progress — autosaved as the cashier moves through the
 * Customer → Products → Labour & Transport → Payment steps, before it
 * becomes a real `Sale` (which deducts stock and posts journal entries).
 * Nothing here is authoritative money/inventory data; it's just enough to
 * repaint the POS UI when the cashier resumes it. Private to the cashier
 * who parked it.
 */
const draftItemSchema = new mongoose.Schema(
  {
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    name: { type: String, required: true },
    sku: { type: String, trim: true, default: '' },
    salePrice: { type: Number, required: true },
    currentStock: { type: Number, default: 0 },
    taxRate: { type: Number, default: 0 },
    warehouseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Warehouse', default: null },
    qty: { type: Number, required: true, min: 1 },
    source: { type: String, enum: ['WAREHOUSE', 'VENDOR'], default: 'WAREHOUSE' },
    vendorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor', default: null },
    vendorName: { type: String, trim: true, default: '' },
  },
  { _id: false },
);

const draftLabourSchema = new mongoose.Schema(
  {
    id: { type: mongoose.Schema.Types.ObjectId, ref: 'Labour', required: true },
    name: { type: String, required: true },
    phoneNumber: { type: String, trim: true, default: '' },
    rent: { type: Number, default: 0, min: 0 },
  },
  { _id: false },
);

const saleDraftSchema = new mongoose.Schema(
  {
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    // Which storefront this draft was started at — set from the header
    // selection, same as the real Sale it will become.
    store: { type: mongoose.Schema.Types.ObjectId, ref: 'Store', default: null, index: true },
    step: { type: Number, min: 1, max: 5, default: 1 },
    customer: {
      id: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', default: null },
      name: { type: String, trim: true, default: '' },
      phone: { type: String, trim: true, default: '' },
    },
    items: { type: [draftItemSchema], default: [] },
    labour: { type: [draftLabourSchema], default: [] },
    driver: {
      name: { type: String, trim: true, default: '' },
      phone: { type: String, trim: true, default: '' },
      vehicleNumber: { type: String, trim: true, default: '' },
    },
    transportFare: { type: Number, default: 0, min: 0 },
    discountValue: { type: Number, default: 0, min: 0 },
    discountType: { type: String, enum: ['amount', 'percent'], default: 'amount' },
    taxPct: { type: Number, default: 0, min: 0 },
    advanceAmount: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true },
);

saleDraftSchema.set('toJSON', {
  transform: (_doc, ret) => {
    delete ret.__v;
    return ret;
  },
});

module.exports = mongoose.model('SaleDraft', saleDraftSchema);
