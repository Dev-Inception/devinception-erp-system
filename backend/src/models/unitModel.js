const mongoose = require('mongoose');

/**
 * A unit of measure (e.g. Piece/pc, Box/box). A first-class catalog entity
 * products reference by id; `abbreviation` is the short label shown on lists
 * and receipts.
 */
const unitSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 40 },
    abbreviation: { type: String, trim: true, maxlength: 20, default: '' },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);

unitSchema.index({ name: 1 }, { unique: true, collation: { locale: 'en', strength: 2 } });

unitSchema.set('toJSON', {
  transform: (_doc, ret) => {
    delete ret.__v;
    return ret;
  },
});

module.exports = mongoose.model('Unit', unitSchema);
