const mongoose = require("mongoose");

/**
 * A vendor (supplier) you purchase goods from. `outstanding` is the amount
 * currently payable to the vendor; it is derived from purchase/payment
 * transactions elsewhere, so it is not set directly through the CRUD API.
 */
const vendorSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Name is required"],
      trim: true,
      maxlength: 120,
      index: true,
    },
    phone: { type: String, trim: true, maxlength: 30, default: "" },
    email: {
      type: String,
      trim: true,
      lowercase: true,
      maxlength: 120,
      default: "",
    },
    // National Tax Number (Pakistan) or any tax identifier.
    ntn: { type: String, trim: true, maxlength: 40, default: "" },
    address: { type: String, trim: true, maxlength: 300, default: "" },

    // Payable balance, maintained by purchase/payment flows. Read-only here.
    outstanding: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true }
);

vendorSchema.set("toJSON", {
  transform: (_doc, ret) => {
    delete ret.__v;
    return ret;
  },
});

module.exports = mongoose.model("Vendor", vendorSchema);
