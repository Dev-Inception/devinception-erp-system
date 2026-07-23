const mongoose = require('mongoose');

/**
 * A sellable product owned by one warehouse. `salePrice` is the default
 * selling price in paisa. Cost is tracked as a moving average in StockLevel.
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

    // Optional only for compatibility with products created before warehouse
    // ownership existed. The service requires it for every new product.
    warehouse: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Warehouse',
      default: null,
      index: true,
    },

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
