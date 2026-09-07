const mongoose = require('mongoose');

/**
 * A price quote given to a prospective customer — captured before any
 * commitment to buy, so it deliberately doesn't touch stock or post any
 * journal entries. `customer` is nullable (a walk-in prospect may not be a
 * registered customer yet); the name/phone/address snapshot fields always
 * carry the lead's contact info regardless, mirroring how Sale keeps
 * `customerName` alongside its own nullable `customer` ref.
 *
 * Lifecycle: PENDING -> (follow-ups logged) -> FOLLOWED_UP -> either
 * CONVERTED (a real sale was created from it — see saleService.createSale's
 * `estimate` input) or LOST. Converted/lost estimates are read-only.
 */
const estimateItemSchema = new mongoose.Schema(
  {
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    name: { type: String, required: true }, // snapshot
    quantity: { type: Number, required: true, min: 0 },
    unitPrice: { type: Number, required: true, min: 0 }, // paisa
    lineTotal: { type: Number, required: true, min: 0 }, // paisa
  },
  { _id: false },
);

const followUpSchema = new mongoose.Schema(
  {
    date: { type: Date, default: Date.now },
    note: { type: String, trim: true, maxlength: 500, required: true },
    by: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { _id: false },
);

const estimateSchema = new mongoose.Schema(
  {
    number: { type: String, required: true, unique: true, index: true }, // EST-2026-000001
    customer: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', default: null },
    customerName: { type: String, required: true, trim: true, maxlength: 120 }, // snapshot
    customerPhone: { type: String, trim: true, maxlength: 40, default: '' }, // snapshot
    customerAddress: { type: String, trim: true, maxlength: 240, default: '' }, // snapshot
    store: { type: mongoose.Schema.Types.ObjectId, ref: 'Store', required: true, index: true },
    date: { type: Date, default: Date.now, index: true },

    items: { type: [estimateItemSchema], required: true },
    subtotal: { type: Number, required: true, min: 0 }, // paisa
    discount: { type: Number, default: 0, min: 0 }, // paisa
    taxPercent: { type: Number, default: 0, min: 0 },
    tax: { type: Number, default: 0, min: 0 }, // paisa
    total: { type: Number, required: true, min: 0 }, // paisa

    notes: { type: String, trim: true, maxlength: 1000, default: '' },

    status: {
      type: String,
      enum: ['PENDING', 'FOLLOWED_UP', 'CONVERTED', 'LOST'],
      default: 'PENDING',
      required: true,
      index: true,
    },
    followUps: { type: [followUpSchema], default: [] },
    // Next time to chase this lead — drives the "due for follow-up" list.
    // Cleared once converted or lost.
    nextFollowUpDate: { type: Date, default: null, index: true },
    lostReason: { type: String, trim: true, maxlength: 500, default: '' },

    convertedSale: { type: mongoose.Schema.Types.ObjectId, ref: 'Sale', default: null },
    convertedAt: { type: Date, default: null },

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true },
);

estimateSchema.set('toJSON', {
  transform: (_doc, ret) => {
    delete ret.__v;
    return ret;
  },
});

module.exports = mongoose.model('Estimate', estimateSchema);
