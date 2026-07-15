const mongoose = require('mongoose');

const gatePassItemSchema = new mongoose.Schema(
  {
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    name: { type: String, required: true },
    quantity: { type: Number, required: true, min: 0 },
  },
  { _id: false },
);

const gatePassSchema = new mongoose.Schema(
  {
    number: { type: String, required: true, unique: true },
    // The random token is the only value encoded in the QR. Business data is
    // resolved server-side after an authenticated scan.
    token: { type: String, required: true, unique: true, select: false },
    sourceType: { type: String, enum: ['PURCHASE', 'SALE'], required: true, index: true },
    purchase: { type: mongoose.Schema.Types.ObjectId, ref: 'GoodsPurchase', default: null },
    sale: { type: mongoose.Schema.Types.ObjectId, ref: 'Sale', default: null },
    documentNumber: { type: String, required: true },
    warehouse: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Warehouse',
      required: true,
      index: true,
    },
    direction: { type: String, enum: ['INBOUND', 'OUTBOUND'], required: true },
    partyName: { type: String, trim: true, default: '' },
    movementDate: { type: Date, required: true },
    items: { type: [gatePassItemSchema], required: true },
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
  { purchase: 1 },
  { unique: true, partialFilterExpression: { purchase: { $type: 'objectId' } } },
);
gatePassSchema.index(
  { sale: 1 },
  { unique: true, partialFilterExpression: { sale: { $type: 'objectId' } } },
);

gatePassSchema.pre('validate', function validateSource() {
  const hasPurchase = Boolean(this.purchase);
  const hasSale = Boolean(this.sale);
  if (hasPurchase === hasSale) {
    this.invalidate('sourceType', 'A gate pass must reference exactly one purchase or sale');
  } else if (this.sourceType === 'PURCHASE' && !hasPurchase) {
    this.invalidate('purchase', 'A purchase gate pass requires a purchase');
  } else if (this.sourceType === 'SALE' && !hasSale) {
    this.invalidate('sale', 'A sale gate pass requires a sale');
  }
});

gatePassSchema.set('toJSON', {
  transform: (_doc, ret) => {
    delete ret.__v;
    delete ret.token;
    return ret;
  },
});

module.exports = mongoose.model('GatePass', gatePassSchema);
