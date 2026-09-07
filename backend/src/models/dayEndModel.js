const mongoose = require('mongoose');

/**
 * One doc per store per business calendar date (see utils/reportDate.js for
 * the shared date convention). A day is "closed" while `reopenedAt` is null;
 * re-closing after a reopen reuses the same doc (clears reopenedBy/At and
 * refreshes closedBy/At) rather than growing a new row per open/close cycle.
 */
const dayEndSchema = new mongoose.Schema(
  {
    store: { type: mongoose.Schema.Types.ObjectId, ref: 'Store', required: true },
    date: { type: String, required: true }, // 'YYYY-MM-DD'
    closedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    closedAt: { type: Date, default: Date.now },
    reopenedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    reopenedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

dayEndSchema.index({ store: 1, date: 1 }, { unique: true });

dayEndSchema.set('toJSON', {
  transform: (_doc, ret) => {
    delete ret.__v;
    return ret;
  },
});

module.exports = mongoose.model('DayEnd', dayEndSchema);
