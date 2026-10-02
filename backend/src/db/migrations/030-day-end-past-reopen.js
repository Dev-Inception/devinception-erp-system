/**
 * Lets an admin reopen a past day for editing while today's day is open.
 * Migration 023's index allowed one session per store that was either never
 * closed or reopened, which ruled that out. Now only a never-closed session
 * (the live day) is limited to one per store; a reopened past day — closed
 * once, then reopened — is tracked separately (see dayEndService.reopenDay).
 */
async function up(db, transaction) {
  await db.query(
    `
    DROP INDEX day_ends_one_open_per_store;
    CREATE UNIQUE INDEX day_ends_one_live_per_store
      ON day_ends (store_id)
      WHERE closed_at IS NULL;
  `,
    { transaction },
  );
}

module.exports = { name: '030-day-end-past-reopen', up };
