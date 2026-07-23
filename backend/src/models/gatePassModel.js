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
    // SALE = goods going out against a sale; PURCHASE = goods coming in
    // against a vendor purchase. Exactly one of sale/purchase is set.
    sourceType: {
      type: String,
      enum: ['SALE', 'PURCHASE'],
      default: 'SALE',
      required: true,
      index: true,
    },
    sale: { type: mongoose.Schema.Types.ObjectId, ref: 'Sale', default: null },
    purchase: { type: mongoose.Schema.Types.ObjectId, ref: 'GoodsPurchase', default: null },
    documentNumber: { type: String, required: true },
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

gatePassSchema.index(
  { sale: 1 },
  { unique: true, partialFilterExpression: { sale: { $type: 'objectId' } } },
);
gatePassSchema.index(
  { purchase: 1 },
  { unique: true, partialFilterExpression: { purchase: { $type: 'objectId' } } },
);

gatePassSchema.set('toJSON', {
  transform: (_doc, ret) => {
    delete ret.__v;
    delete ret.token;
    return ret;
  },
});

module.exports = mongoose.model('GatePass', gatePassSchema);
