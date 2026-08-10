const mongoose = require('mongoose');
const { PAYMENT_METHODS } = require('../utils/finance');

/**
 * A POS sale. Selling posts revenue (Dr Cash/Bank/Receivable, Cr Sales) and
 * cost of goods sold (Dr COGS, Cr Inventory), and lowers stock. `cashAmount`
 * and `onlineAmount` record how it was settled (a credit sale leaves the rest
 * as a receivable). All money is paisa; `cost` is the COGS captured at sale
 * time for the Profit & Loss report.
 */
const saleItemSchema = new mongoose.Schema(
  {
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    name: { type: String, required: true }, // snapshot
    quantity: { type: Number, required: true, min: 0 },
    unitPrice: { type: Number, required: true, min: 0 }, // paisa
    lineTotal: { type: Number, required: true, min: 0 }, // paisa
    cost: { type: Number, default: 0, min: 0 }, // COGS for the line (paisa)
    // WAREHOUSE (default) deducts from stock as usual. VENDOR skips the
    // stock check/deduction entirely — the item is sourced specially for
    // this sale rather than pulled from inventory, so it carries no COGS.
    // A line becomes VENDOR-sourced whenever a vendor is attached to it.
    source: { type: String, enum: ['WAREHOUSE', 'VENDOR'], default: 'WAREHOUSE' },
    // Which warehouse this line was pulled from — a sale can mix lines from
    // several warehouses; each gets its own gate pass (see
    // `warehouseGatePasses` below). Null for VENDOR-sourced lines.
    warehouse: { type: mongoose.Schema.Types.ObjectId, ref: 'Warehouse', default: null },
    vendor: { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor', default: null },
    vendorName: { type: String, default: '' }, // snapshot
  },
  { _id: false },
);

const saleWarehouseGatePassSchema = new mongoose.Schema(
  {
    warehouse: { type: mongoose.Schema.Types.ObjectId, ref: 'Warehouse', required: true },
    gatePass: { type: mongoose.Schema.Types.ObjectId, ref: 'GatePass', required: true },
  },
  { _id: false },
);

const saleLabourSchema = new mongoose.Schema(
  {
    labour: { type: mongoose.Schema.Types.ObjectId, ref: 'Labour', required: true },
    name: { type: String, required: true },
    phoneNumber: { type: String, default: '' },
    rent: { type: Number, default: 0, min: 0 }, // paisa, this labourer's charge — summed into labourRent
  },
  { _id: false },
);

// Informational transport details captured at POS time — distinct from
// GatePass.driver, which is only set once a gate pass is formally processed
// (signed off) at the loading dock.
const saleTransportSchema = new mongoose.Schema(
  {
    driverName: { type: String, trim: true, default: '' },
    driverPhone: { type: String, trim: true, default: '' },
    vehicleNumber: { type: String, trim: true, default: '' },
  },
  { _id: false },
);

const saleSchema = new mongoose.Schema(
  {
    number: { type: String, required: true, unique: true, index: true }, // SALE-2026-000010
    customer: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', default: null, index: true },
    customerName: { type: String, default: 'Walk-in' }, // snapshot
    // The physical storefront this sale was made at — set once at checkout
    // from whichever store the cashier had selected, and never changed by a
    // later edit. Distinct from `warehouse` below (where the stock came
    // from): a store can draw stock from more than one warehouse.
    store: { type: mongoose.Schema.Types.ObjectId, ref: 'Store', required: true, index: true },
    // The "primary" warehouse — the first warehouse-sourced line's warehouse
    // (or the resolved default if the sale is entirely vendor-sourced). Kept
    // for reports/dashboards/filters that assume one warehouse per sale; the
    // real per-line breakdown lives on each item and on `warehouseGatePasses`.
    warehouse: { type: mongoose.Schema.Types.ObjectId, ref: 'Warehouse', required: true },
    date: { type: Date, default: Date.now, index: true },

    items: { type: [saleItemSchema], required: true },
    labour: { type: [saleLabourSchema], default: [] },
    transport: { type: saleTransportSchema, default: () => ({}) },

    subtotal: { type: Number, required: true, min: 0 }, // paisa, before discount
    discount: { type: Number, default: 0, min: 0 }, // paisa
    taxPercent: { type: Number, default: 0, min: 0 }, // % applied to net
    tax: { type: Number, default: 0, min: 0 }, // paisa, output tax
    transportFare: { type: Number, default: 0, min: 0 }, // paisa, delivery/transport charge — included in total
    labourRent: { type: Number, default: 0, min: 0 }, // paisa, sum of labour[].rent — included in total
    total: { type: Number, required: true, min: 0 }, // paisa, payable (net + tax + transportFare + labourRent)
    cost: { type: Number, default: 0, min: 0 }, // total COGS (paisa)

    paymentMethod: { type: String, enum: PAYMENT_METHODS, required: true },
    cashAmount: { type: Number, default: 0, min: 0 }, // paisa settled in cash at checkout
    onlineAmount: { type: Number, default: 0, min: 0 }, // paisa settled to a bank at checkout
    creditAmount: { type: Number, default: 0, min: 0 }, // paisa left on account (AR) after checkout
    // Paid later (after checkout) against this specific sale's balance — e.g.
    // "customer pays in full after delivery". Distinct from cashAmount/
    // onlineAmount, which are fixed at checkout. See saleService.recordPayment.
    additionalPaidAmount: { type: Number, default: 0, min: 0 }, // paisa
    // Cumulative value of all SaleReturn documents against this sale — reduces
    // the effective amount owed without rewriting the original invoice total.
    returnedTotal: { type: Number, default: 0, min: 0 }, // paisa
    bankAccount: { type: mongoose.Schema.Types.ObjectId, ref: 'BankAccount', default: null },
    // Proof-of-transfer for any online/bank-settled portion (a URL or upload
    // reference). Required by the POS whenever money lands online.
    transferReceiptRef: { type: String, trim: true, default: '' },
    lastEditedAt: { type: Date, default: null },
    lastEditedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },

    // Legacy/back-compat single pointer — the first (primary) warehouse gate
    // pass, for pages that only ever show one "View Gate Pass" button. The
    // full breakdown (one pass per warehouse actually used) is
    // `warehouseGatePasses` below.
    gatePass: { type: mongoose.Schema.Types.ObjectId, ref: 'GatePass', default: null },
    // One entry per distinct warehouse the sale's WAREHOUSE-sourced lines
    // came from — each gets its own gate pass, since goods physically leave
    // from different locations.
    warehouseGatePasses: { type: [saleWarehouseGatePassSchema], default: [] },
    // Set only when the sale has vendor-sourced lines — a single additional
    // gate pass covering just those lines (regardless of how many vendors).
    vendorGatePass: { type: mongoose.Schema.Types.ObjectId, ref: 'GatePass', default: null },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true },
);

saleSchema.set('toJSON', {
  transform: (_doc, ret) => {
    delete ret.__v;
    return ret;
  },
});

module.exports = mongoose.model('Sale', saleSchema);
