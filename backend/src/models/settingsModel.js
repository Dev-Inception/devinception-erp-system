const mongoose = require('mongoose');

/**
 * Company/application settings — a single document for the whole install
 * (company name, contact details, tax number, display currency). The `key`
 * field is a fixed value with a unique index so there is exactly one row.
 * Replaces the env-only company info so it can be edited from the UI.
 */
const settingsSchema = new mongoose.Schema(
  {
    key: { type: String, default: 'app', unique: true, immutable: true },
    companyName: { type: String, trim: true, default: '' },
    address: { type: String, trim: true, default: '' },
    phone: { type: String, trim: true, default: '' },
    email: { type: String, trim: true, default: '' },
    taxNumber: { type: String, trim: true, default: '' },
    currency: { type: String, trim: true, default: 'PKR' },
  },
  { timestamps: true },
);

settingsSchema.set('toJSON', {
  transform: (_doc, ret) => {
    delete ret.__v;
    delete ret.key;
    return ret;
  },
});

module.exports = mongoose.model('Settings', settingsSchema);
