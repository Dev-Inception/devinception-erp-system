const mongoose = require("mongoose");

/**
 * A stocking location (store / warehouse). Stock quantities and valuation are
 * tracked per-warehouse via StockLevel. Exactly one warehouse is the default,
 * used when a sale/purchase doesn't name one.
 */
const warehouseSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Name is required"],
      trim: true,
      maxlength: 120,
      index: true,
    },
    // Short branch label shown on the warehouse cards (e.g. "HQ", "Downtown").
    location: { type: String, trim: true, maxlength: 120, default: "" },
    address: { type: String, trim: true, maxlength: 300, default: "" },
    isDefault: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

warehouseSchema.set("toJSON", {
  transform: (_doc, ret) => {
    delete ret.__v;
    return ret;
  },
});

module.exports = mongoose.model("Warehouse", warehouseSchema);
