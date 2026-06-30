const mongoose = require('mongoose');

/**
 * A product category. A first-class catalog entity (rather than the free-text
 * string products used to carry) so the catalog can be managed and products
 * reference it by id.
 */
const categorySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);

// Names are unique (case-insensitive) so the same category isn't created twice.
categorySchema.index({ name: 1 }, { unique: true, collation: { locale: 'en', strength: 2 } });

categorySchema.set('toJSON', {
  transform: (_doc, ret) => {
    delete ret.__v;
    return ret;
  },
});

module.exports = mongoose.model('Category', categorySchema);
