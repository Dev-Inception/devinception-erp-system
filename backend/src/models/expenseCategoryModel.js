const mongoose = require('mongoose');

/**
 * A bucket for day-to-day operating expenses (food, utilities, chair/AC
 * repairs, transport, ...) — a first-class entity (like Category/Unit in the
 * product catalog) so spend can be grouped and reported by category instead
 * of living only in free-text notes.
 */
const expenseCategorySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    description: { type: String, trim: true, maxlength: 500, default: '' },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);

expenseCategorySchema.index(
  { name: 1 },
  { unique: true, collation: { locale: 'en', strength: 2 } },
);

expenseCategorySchema.set('toJSON', {
  transform: (_doc, ret) => {
    delete ret.__v;
    return ret;
  },
});

module.exports = mongoose.model('ExpenseCategory', expenseCategorySchema);
