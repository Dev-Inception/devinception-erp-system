const mongoose = require('mongoose');

const gatePassItemSchema = new mongoose.Schema(
  {
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    name: { type: String, required: true },
    sku: { type: String, trim: true, default: '' },
    barcode: { type: String, trim: true, default: '' },
    quantity: { type: Number, required: true, min: 0 },
    unitPrice: { type: Number, min: 0 }, // paisa snapshot from the sale
    lineTotal: { type: Number, min: 0 }, // paisa snapshot from the sale
  },
  { _id: false },
);

const gatePassPricingSchema = new mongoose.Schema(
  {
    subtotal: { type: Number, required: true, min: 0 },
    discount: { type: Number, required: true, min: 0 },
    taxPercent: { type: Number, required: true, min: 0 },
    tax: { type: Number, required: true, min: 0 },
    total: { type: Number, required: true, min: 0 },
  },
  { _id: false },
);

const gatePassCustomerSchema = new mongoose.Schema(
  {
    customer: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', default: null },
    name: { type: String, required: true, trim: true },
    phone: { type: String, trim: true, default: '' },
    email: { type: String, trim: true, default: '' },
    address: { type: String, trim: true, default: '' },
  },
  { _id: false },
);

const gatePassSchema = new mongoose.Schema(
  {
    number: { type: String, required: true, unique: true },
    // The random token is the only value encoded in the QR. Business data is
    // resolved server-side after an authenticated scan.
    token: { type: String, required: true, unique: true, select: false },
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
    saleDate: { type: Date, default: null },
    purchaseDate: { type: Date, default: null },
    customerInfo: { type: gatePassCustomerSchema, default: null },
    vendorInfo: {
      type: new mongoose.Schema(
        {
          vendor: { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor', default: null },
          name: { type: String, required: true, trim: true },
          phone: { type: String, trim: true, default: '' },
          email: { type: String, trim: true, default: '' },
          address: { type: String, trim: true, default: '' },
        },
        { _id: false },
      ),
      default: null,
    },
    items: { type: [gatePassItemSchema], required: true },
    pricing: { type: gatePassPricingSchema, default: null },
    status: {
      type: String,
      enum: ['ACTIVE', 'USED', 'CANCELLED'],
      default: 'ACTIVE',
      required: true,
      index: true,
    },
    scannedAt: { type: Date, default: null },
    scannedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
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
