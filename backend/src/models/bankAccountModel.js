const mongoose = require("mongoose");

/**
 * A bank (or online wallet) account. Its running balance is NOT stored here —
 * it is the natural balance of the BANK journal lines that reference this
 * account. An opening balance, if given, is posted as an OPENING journal entry
 * at creation time. Money is paisa.
 */
const bankAccountSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Name is required"],
      trim: true,
      maxlength: 120,
      index: true,
    },
    bankName: { type: String, trim: true, maxlength: 120, default: "" },
    accountNumber: { type: String, trim: true, maxlength: 60, default: "" },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

bankAccountSchema.set("toJSON", {
  transform: (_doc, ret) => {
    delete ret.__v;
    return ret;
  },
});

module.exports = mongoose.model("BankAccount", bankAccountSchema);
