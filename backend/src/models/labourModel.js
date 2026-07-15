const mongoose = require('mongoose');

const labourSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Labour name is required'],
      trim: true,
      minlength: [2, 'Name must be at least 2 characters'],
      maxlength: [100, 'Name cannot exceed 100 characters'],
    },
    phoneNumber: {
      type: String,
      required: [true, 'Phone number is required'],
      trim: true,
      match: [/^[0-9+\-\s()]{10,15}$/, 'Please enter a valid phone number'],
      unique: true,
    },
    // Optional fields you might need later:
    // address: { type: String, trim: true },
    // isActive: { type: Boolean, default: true },
    // hourlyRate: { type: Number, min: 0 },
  },
  { timestamps: true },
);

labourSchema.set('toJSON', {
  transform: (_doc, ret) => {
    delete ret.__v;
    return ret;
  },
});

module.exports = mongoose.model('Labour', labourSchema);
