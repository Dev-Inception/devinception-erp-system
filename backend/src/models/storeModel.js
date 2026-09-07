const mongoose = require('mongoose');

/**
 * A storefront — a business-facing location that groups one or more
 * Warehouses. This is the unit the header's storefront switcher and the
 * login-time store picker operate on; "viewing Store X" resolves to
 * filtering by X's warehouses (see utils/storeScope.js). Exactly one store is
 * the default, used to seed the picker/switcher before a user has chosen.
 */
const storeSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Name is required'],
      trim: true,
      maxlength: 120,
      index: true,
    },
    // Short label, e.g. "LHR-01".
    code: { type: String, trim: true, maxlength: 20, default: '' },
    address: { type: String, trim: true, maxlength: 300, default: '' },
    warehouses: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Warehouse' }],
    isDefault: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);

storeSchema.set('toJSON', {
  transform: (_doc, ret) => {
    delete ret.__v;
    return ret;
  },
});

module.exports = mongoose.model('Store', storeSchema);
