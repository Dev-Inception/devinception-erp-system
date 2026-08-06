const mongoose = require('mongoose');

/**
 * A product return against a completed sale. Each return is its own numbered
 * document (RETURN-2026-000001) so there's a clear audit trail of what was
 * returned, when, and by whom — a sale can have several partial returns over
 * time. Creating one restocks the returned quantity (WAREHOUSE-sourced lines
 * only) and posts reversing journal entries for revenue/tax/COGS; see
 * saleReturnService.
 */
const saleReturnItemSchema = new mongoose.Schema(
  {
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    name: { type: String, required: true }, // snapshot
    quantity: { type: Number, required: true, min: 0 },
    unitPrice: { type: Number, required: true, min: 0 }, // paisa, from the original sale line
    lineTotal: { type: Number, required: true, min: 0 }, // paisa
    cost: { type: Number, default: 0, min: 0 }, // COGS reversed for this line (paisa)
    source: { type: String, enum: ['WAREHOUSE', 'VENDOR'], default: 'WAREHOUSE' },
    // Restock target for WAREHOUSE-sourced lines (the warehouse the original
    // sale line came from). Null for VENDOR-sourced lines — those were never
    // in stock, so a return of one doesn't restock anything.
    warehouse: { type: mongoose.Schema.Types.ObjectId, ref: 'Warehouse', default: null },
  },
  { _id: false },
);

const saleReturnSchema = new mongoose.Schema(
  {
    number: { type: String, required: true, unique: true }, // RETURN-2026-000001
    sale: { type: mongoose.Schema.Types.ObjectId, ref: 'Sale', required: true, index: true },
    saleNumber: { type: String, required: true }, // snapshot
    customer: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', default: null },
    customerName: { type: String, default: '' }, // snapshot
    date: { type: Date, default: Date.now, index: true },
    items: { type: [saleReturnItemSchema], required: true },
    subtotal: { type: Number, required: true, min: 0 }, // paisa, sum of item lineTotals
    // Discount and tax are apportioned from the original sale's totals,
    // proportional to how much of the sale's subtotal this return represents.
    discount: { type: Number, default: 0, min: 0 }, // paisa
    tax: { type: Number, default: 0, min: 0 }, // paisa
    total: { type: Number, required: true, min: 0 }, // paisa, deducted from the sale's balance
    cost: { type: Number, default: 0, min: 0 }, // paisa, total COGS reversed
    note: { type: String, trim: true, maxlength: 500, default: '' },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true },
);

saleReturnSchema.set('toJSON', {
  transform: (_doc, ret) => {
    delete ret.__v;
    return ret;
  },
});

module.exports = mongoose.model('SaleReturn', saleReturnSchema);
