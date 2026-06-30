const mongoose = require('mongoose');

/**
 * A sellable product. `salePrice` is the default selling price in paisa.
 * Cost is NOT stored here — it is tracked per warehouse as a moving-average
 * (StockLevel.avgCost) because the same product can be received at different
 * costs over time.
 */
const productSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Name is required'],
      trim: true,
      maxlength: 160,
      index: true,
    },
    sku: {
      type: String,
      trim: true,
      uppercase: true,
      maxlength: 60,
      default: '',
    },
    barcode: { type: String, trim: true, maxlength: 60, default: '' },

    // Catalog classification, referenced by id (see Category/Brand/Unit models).
    category: { type: mongoose.Schema.Types.ObjectId, ref: 'Category', default: null },
    brand: { type: mongoose.Schema.Types.ObjectId, ref: 'Brand', default: null },
    unit: { type: mongoose.Schema.Types.ObjectId, ref: 'Unit', default: null },

    // Catalog default prices (paisa). `purchasePrice` is the expected buying
    // rate shown in the catalog; actual stock cost is the moving-average
    // StockLevel.avgCost set by purchases.
    purchasePrice: { type: Number, default: 0, min: 0 },
    salePrice: { type: Number, default: 0, min: 0 },

    taxPercent: { type: Number, default: 0, min: 0 }, // default sales tax %
    minStock: { type: Number, default: 0, min: 0 }, // low-stock threshold

    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);

// SKUs are unique when present (sparse so multiple blank SKUs are allowed).
productSchema.index({ sku: 1 }, { unique: true, partialFilterExpression: { sku: { $gt: '' } } });

productSchema.set('toJSON', {
  transform: (_doc, ret) => {
    delete ret.__v;
    return ret;
  },
});

module.exports = mongoose.model('Product', productSchema);
