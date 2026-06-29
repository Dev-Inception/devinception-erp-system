const mongoose = require("mongoose");

/**
 * Current stock of a product in a warehouse. `avgCost` is the moving-average
 * unit cost in paisa, recomputed on every receipt; `quantity * avgCost` is the
 * inventory value used by the Stock Valuation report. One row per
 * (product, warehouse).
 */
const stockLevelSchema = new mongoose.Schema(
  {
    product: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true },
    warehouse: { type: mongoose.Schema.Types.ObjectId, ref: "Warehouse", required: true },
    quantity: { type: Number, default: 0 },
    avgCost: { type: Number, default: 0, min: 0 }, // paisa per unit
  },
  { timestamps: true }
);

stockLevelSchema.index({ product: 1, warehouse: 1 }, { unique: true });

stockLevelSchema.set("toJSON", {
  transform: (_doc, ret) => {
    delete ret.__v;
    return ret;
  },
});

module.exports = mongoose.model("StockLevel", stockLevelSchema);
