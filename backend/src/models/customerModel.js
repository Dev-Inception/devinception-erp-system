const mongoose = require('mongoose');

/**
 * A customer you sell to. `creditLimit` caps how much they may owe on
 * account; `outstanding` is the amount currently receivable and is derived
 * from sale/payment transactions elsewhere, so it is not set through the
 * CRUD API.
 */
const customerSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Name is required'],
      trim: true,
      maxlength: 120,
      index: true,
    },
    phone: { type: String, trim: true, maxlength: 30, default: '' },
    email: {
      type: String,
      trim: true,
      lowercase: true,
      maxlength: 120,
      default: '',
    },
    address: { type: String, trim: true, maxlength: 300, default: '' },

    creditLimit: { type: Number, default: 0, min: 0 },

    // Receivable balance, maintained by sale/payment flows. Read-only here.
    outstanding: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true },
);

customerSchema.set('toJSON', {
  transform: (_doc, ret) => {
    delete ret.__v;
    return ret;
  },
});

module.exports = mongoose.model('Customer', customerSchema);
