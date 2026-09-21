const { DataTypes } = require('sequelize');
const { id, defineModel } = require('./helpers');

// A "day end" row is a business-day session: opened explicitly (or lazily,
// for stores that never bother with the Open button), it stays open across
// any number of calendar-date rollovers until explicitly closed — see
// dayEndService for how `isOpen` is derived (closedAt null, or reopenedAt
// set after a close). `date` is the calendar date the session was *opened*
// on, not necessarily every date it covers.
module.exports = function defineDayEnd(db) {
  return defineModel(
    db,
    'DayEnd',
    {
      id: id(),
      store: { type: DataTypes.STRING(24), allowNull: false, field: 'store_id' },
      // Business calendar date ('YYYY-MM-DD') the session opened on, stored
      // as a plain SQL DATE — the app formats/parses it the same way (see
      // utils/reportDate.js).
      date: { type: DataTypes.DATEONLY, allowNull: false },
      openedBy: { type: DataTypes.STRING(24), allowNull: false, field: 'opened_by_id' },
      openedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
      // Cash carried forward from the previous session's remainingBalance
      // (0 for a store's first-ever session).
      openingBalance: {
        type: DataTypes.BIGINT,
        allowNull: false,
        defaultValue: 0,
        field: 'opening_balance',
      },
      closedBy: { type: DataTypes.STRING(24), field: 'closed_by_id' },
      closedAt: { type: DataTypes.DATE, field: 'closed_at' },
      // Amount the closer says they're handing over to the admin, and what's
      // left in the drawer after that handover — both captured at close time
      // and set only then. remainingBalance becomes the next session's
      // openingBalance.
      handoverAmount: { type: DataTypes.BIGINT, field: 'handover_amount' },
      remainingBalance: { type: DataTypes.BIGINT, field: 'remaining_balance' },
      reopenedBy: { type: DataTypes.STRING(24), field: 'reopened_by_id' },
      reopenedAt: { type: DataTypes.DATE },
    },
    { tableName: 'day_ends' },
  );
};
