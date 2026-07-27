const name = '002-gate-pass-processing';

async function up(db, transaction) {
  await db.query(
    `
    ALTER TABLE gate_passes
      DROP CONSTRAINT IF EXISTS gate_passes_status_check;

    UPDATE gate_passes
      SET status = CASE
        WHEN status = 'ACTIVE' THEN 'PENDING'
        WHEN status = 'USED' THEN 'PROCESSED'
        ELSE status
      END;

    ALTER TABLE gate_passes
      ALTER COLUMN status SET DEFAULT 'PENDING',
      ADD CONSTRAINT gate_passes_status_check
        CHECK (status IN ('PENDING', 'PROCESSED', 'CANCELLED')),
      ADD COLUMN driver JSONB,
      ADD COLUMN load_notes TEXT NOT NULL DEFAULT '',
      ADD COLUMN signature_data TEXT,
      ADD COLUMN processed_at TIMESTAMPTZ,
      ADD COLUMN processed_by_id VARCHAR(24) REFERENCES users(id) ON DELETE SET NULL,
      ADD COLUMN last_edited_at TIMESTAMPTZ,
      ADD COLUMN last_edited_by_id VARCHAR(24) REFERENCES users(id) ON DELETE SET NULL;

    UPDATE gate_passes
      SET processed_at = scanned_at,
          processed_by_id = scanned_by_id
      WHERE status = 'PROCESSED';

    ALTER TABLE gate_passes
      DROP COLUMN scanned_at,
      DROP COLUMN scanned_by_id;

    ALTER TABLE gate_pass_items
      ADD COLUMN loaded_quantity NUMERIC(20,6),
      ADD COLUMN load_confirmed BOOLEAN NOT NULL DEFAULT FALSE;
    `,
    { transaction },
  );
}

module.exports = { name, up };
