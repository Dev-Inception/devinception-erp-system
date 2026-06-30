const mongoose = require('mongoose');

/**
 * Append-only log of every stock change, mirroring the journal's philosophy
 * for inventory. Each receipt, issue or adjustment writes one movement at the
 * unit cost in effect, giving a full audit trail behind the StockLevel totals.
 */
const stockMovementSchema = new mongoose.Schema(
  {
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true, index: true },
    warehouse: { type: mongoose.Schema.Types.ObjectId, ref: 'Warehouse', required: true },

    type: { type: String, enum: ['IN', 'OUT', 'ADJUST'], required: true },
    // Signed change applied to stock (negative for OUT / downward ADJUST).
    quantity: { type: Number, required: true },
    unitCost: { type: Number, default: 0, min: 0 }, // paisa per unit at the time

    refType: { type: String, default: '' }, // SALE | PURCHASE | ADJUST | OPENING
    refNo: { type: String, default: '' },
    date: { type: Date, default: Date.now, index: true },
  },
  { timestamps: true },
);

stockMovementSchema.set('toJSON', {
  transform: (_doc, ret) => {
    delete ret.__v;
    return ret;
  },
});

module.exports = mongoose.model('StockMovement', stockMovementSchema);
