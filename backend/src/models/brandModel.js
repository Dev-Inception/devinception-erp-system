const mongoose = require('mongoose');

/**
 * A product brand/manufacturer. A first-class catalog entity products
 * reference by id.
 */
const brandSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);

brandSchema.index({ name: 1 }, { unique: true, collation: { locale: 'en', strength: 2 } });

brandSchema.set('toJSON', {
  transform: (_doc, ret) => {
    delete ret.__v;
    return ret;
  },
});

module.exports = mongoose.model('Brand', brandSchema);
