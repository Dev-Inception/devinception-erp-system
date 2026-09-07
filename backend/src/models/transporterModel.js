const mongoose = require('mongoose');

/**
 * A transporter/trucker you can book delivery fares against. `outstanding`
 * is the amount currently payable to them; it is derived from charge/payment
 * transactions elsewhere, so it is not set directly through the CRUD API —
 * same shape as vendorModel.js.
 */
const transporterSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Name is required'],
      trim: true,
      maxlength: 120,
      index: true,
    },
    phone: { type: String, trim: true, maxlength: 30, default: '' },
    vehicleNumber: { type: String, trim: true, maxlength: 40, default: '' },
    address: { type: String, trim: true, maxlength: 300, default: '' },

    // Payable balance, maintained by charge/payment flows. Read-only here.
    outstanding: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true },
);

transporterSchema.set('toJSON', {
  transform: (_doc, ret) => {
    delete ret.__v;
    return ret;
  },
});

module.exports = mongoose.model('Transporter', transporterSchema);
