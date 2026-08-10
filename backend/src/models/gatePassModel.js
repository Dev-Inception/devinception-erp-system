const mongoose = require('mongoose');

const gatePassItemSchema = new mongoose.Schema(
  {
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    name: { type: String, required: true },
    sku: { type: String, trim: true, default: '' },
    barcode: { type: String, trim: true, default: '' },
    quantity: { type: Number, required: true, min: 0 },
    loadedQuantity: { type: Number, min: 0, default: null },
    loadConfirmed: { type: Boolean, default: false },
  },
  { _id: false },
);

const gatePassDriverSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    phone: { type: String, trim: true, maxlength: 40, default: '' },
    licenseNumber: { type: String, trim: true, maxlength: 80, default: '' },
    vehicleNumber: { type: String, required: true, trim: true, maxlength: 80 },
  },
  { _id: false },
);

const gatePassSchema = new mongoose.Schema(
  {
    number: { type: String, required: true, unique: true },
    // The random token is the only value encoded in the QR. Business data is
    // resolved server-side after an authenticated (or token-authenticated
    // public) scan.
    token: { type: String, required: true, unique: true, select: false },
    // Only SALE gate passes exist (goods going out against a sale).
    sourceType: {
      type: String,
      enum: ['SALE'],
      default: 'SALE',
      required: true,
      index: true,
    },
    sale: { type: mongoose.Schema.Types.ObjectId, ref: 'Sale', default: null },
    // CUSTOMER = goods leaving a warehouse against this sale — scoped to ONE
    // warehouse (`warehouse` below), so a sale spanning several warehouses
    // gets several CUSTOMER passes, one per warehouse. VENDOR = the sale's
    // vendor-sourced lines (all of them, regardless of how many vendors) — a
    // single additional pass, since that portion never touched warehouse
    // stock. See gatePassService's `createGatePassesForSale`.
    kind: { type: String, enum: ['CUSTOMER', 'VENDOR'], default: 'CUSTOMER', required: true },
    documentNumber: { type: String, required: true },
    // Snapshot of the sale's customer name, so the list can show/filter by
    // party without joining back to the sale.
    partyName: { type: String, trim: true, default: '' },
    // Copied from the originating sale's own `store` — gate passes are always
    // derived from a sale, so this is never captured independently.
    store: { type: mongoose.Schema.Types.ObjectId, ref: 'Store', default: null, index: true },
    warehouse: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Warehouse',
      required: true,
      index: true,
    },
    saleDate: { type: Date, required: true },
    items: { type: [gatePassItemSchema], required: true },
    status: {
      type: String,
      // ACTIVE/USED remain accepted so existing deployments can migrate their
      // older records lazily when they are next read.
      enum: ['PENDING', 'PROCESSED', 'CANCELLED', 'ACTIVE', 'USED'],
      default: 'PENDING',
      required: true,
      index: true,
    },
    driver: { type: gatePassDriverSchema, default: null },
    loadNotes: { type: String, trim: true, maxlength: 1000, default: '' },
    signatureData: { type: String, default: null, select: false },
    processedAt: { type: Date, default: null },
    processedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    lastEditedAt: { type: Date, default: null },
    lastEditedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true },
);

// A sale can have multiple CUSTOMER-kind passes (one per warehouse) but only
// one per (kind, warehouse) pair — the VENDOR pass always uses the same
// (primary) warehouse value, so this still guarantees exactly one of those.
gatePassSchema.index(
  { sale: 1, kind: 1, warehouse: 1 },
  { unique: true, partialFilterExpression: { sale: { $type: 'objectId' } } },
);

gatePassSchema.set('toJSON', {
  transform: (_doc, ret) => {
    delete ret.__v;
    delete ret.token;
    return ret;
  },
});

module.exports = mongoose.model('GatePass', gatePassSchema);
