/**
 * Turns Day End from a per-calendar-date lock into a business-day "session":
 * a store's day now stays open across a midnight rollover until someone
 * explicitly closes it (see dayEndService), instead of implicitly resetting
 * to "open" the moment the calendar date changes. A row now represents one
 * open-to-close session (`date` = the calendar date it was opened on), and
 * carries the cash handover captured at close time so the next session can
 * start from the correct opening balance.
 *
 * `closed_by_id`/`closed_at` become nullable since a row is now created at
 * *open* time, before it's necessarily closed. The old UNIQUE(store_id,
 * date) is replaced with a partial unique index that only allows one open
 * session per store at a time (a store can have several closed sessions on
 * the same calendar date if it's opened/closed more than once in a day).
 */
async function up(db, transaction) {
  // Backfilled opened_at must line up with the app's business-day boundary
  // (see utils/reportDate.js's parseReportDate) rather than a plain DATE ->
  // TIMESTAMPTZ cast, which resolves midnight in the DB session's timezone
  // (typically UTC) instead — up to REPORT_TIMEZONE_OFFSET hours off, enough
  // to drop that morning's transactions out of the session's cash-on-hand
  // calculation (see dayEndService.cashMovementSince).
  const offset = process.env.REPORT_TIMEZONE_OFFSET || '+05:00';
  if (!/^[+-]\d{2}:\d{2}$/.test(offset)) {
    throw new Error('REPORT_TIMEZONE_OFFSET must use +HH:MM or -HH:MM');
  }
  await db.query(
    `
    ALTER TABLE day_ends
      ADD COLUMN opened_by_id VARCHAR(24) REFERENCES users(id) ON DELETE RESTRICT,
      ADD COLUMN opened_at TIMESTAMPTZ,
      ADD COLUMN opening_balance BIGINT NOT NULL DEFAULT 0,
      ADD COLUMN handover_amount BIGINT,
      ADD COLUMN remaining_balance BIGINT;

    -- Backfill existing (close-only) rows: best-effort attribution since who
    -- opened them and exactly when was never recorded pre-migration.
    UPDATE day_ends
      SET opened_by_id = closed_by_id,
          opened_at = (date::text || 'T00:00:00${offset}')::timestamptz
      WHERE opened_by_id IS NULL;

    ALTER TABLE day_ends
      ALTER COLUMN opened_by_id SET NOT NULL,
      ALTER COLUMN opened_at SET NOT NULL,
      ALTER COLUMN closed_by_id DROP NOT NULL,
      ALTER COLUMN closed_at DROP NOT NULL,
      ALTER COLUMN closed_at DROP DEFAULT;

    ALTER TABLE day_ends DROP CONSTRAINT day_ends_store_id_date_key;

    CREATE UNIQUE INDEX day_ends_one_open_per_store
      ON day_ends (store_id)
      WHERE closed_at IS NULL OR reopened_at IS NOT NULL;
  `,
    { transaction },
  );
}

module.exports = { name: '023-day-end-sessions', up };
