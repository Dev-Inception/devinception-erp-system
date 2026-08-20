const mongoose = require('mongoose');

/**
 * An item procured from a vendor whose cost hasn't been priced yet — either a
 * vendor-sourced POS sale line (Sale.items[].source === 'VENDOR') or a stock
 * receipt line (every receipt is against a vendor). Both are things we owe
 * the vendor for but haven't recorded as a payable. It starts PENDING; only a
 * super admin can price it (pendingEntityService.setPurchasePrice), which
 * posts the real accounts-payable journal entry — see that service for the
 * accounting.
 */
const pendingEntitySchema = new mongoose.Schema(
  {
    sourceType: { type: String, enum: ['SALE_ITEM', 'STOCK_RECEIPT_ITEM'], required: true },
    sale: { type: mongoose.Schema.Types.ObjectId, ref: 'Sale', default: null },
    stockReceipt: { type: mongoose.Schema.Types.ObjectId, ref: 'StockReceipt', default: null },
    sourceNo: { type: String, default: '' }, // snapshot of the sale/receipt number

    vendor: { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor', required: true, index: true },
    vendorName: { type: String, default: '' }, // snapshot

    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    productName: { type: String, default: '' }, // snapshot
    quantity: { type: Number, required: true, min: 0 },

    store: { type: mongoose.Schema.Types.ObjectId, ref: 'Store', default: null, index: true },
    // Only set for STOCK_RECEIPT_ITEM — vendor sale items were never held in
    // any warehouse.
    warehouse: { type: mongoose.Schema.Types.ObjectId, ref: 'Warehouse', default: null },
    date: { type: Date, default: Date.now },

    status: { type: String, enum: ['PENDING', 'PRICED'], default: 'PENDING', index: true },
    purchasePrice: { type: Number, default: null, min: 0 }, // paisa, per unit
    lineTotal: { type: Number, default: null, min: 0 }, // paisa, purchasePrice * quantity

    pricedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    pricedAt: { type: Date, default: null },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true },
);

pendingEntitySchema.index({ status: 1, date: -1 });

pendingEntitySchema.set('toJSON', {
  transform: (_doc, ret) => {
    delete ret.__v;
    return ret;
  },
});

module.exports = mongoose.model('PendingEntity', pendingEntitySchema);
