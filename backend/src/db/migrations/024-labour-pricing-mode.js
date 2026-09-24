/**
 * Lets a store choose how labour charged on a POS sale is paid out
 * (Settings → Labour pricing):
 *  - DIRECT (default, the existing behaviour): the rent charged to the
 *    customer is booked straight away as owed to the labourer in full.
 *  - PENDING: the customer is still charged the rent, but the labourer's
 *    actual payout is decided later — each labour line lands in Pending
 *    Entities (source_type SALE_LABOUR) and only goes payable (AP_LABOUR)
 *    once someone with pending-entities:price enters what was agreed. The
 *    difference (charged − payout) stays with the store as margin.
 *
 * `sales.labour_pricing_mode` snapshots which mode a sale was made under, so
 * later edits of that sale reverse/repost its labour the same way it was
 * originally booked, even if the store has since switched modes.
 *
 * Pending entities gain labour columns; `product_id` becomes nullable (a
 * labour line has no product) and the per-source-type shape CHECK is
 * rebuilt to cover the new SALE_LABOUR type.
 */
async function up(db, transaction) {
  await db.query(
    `
    ALTER TABLE settings ADD COLUMN labour_pricing_mode VARCHAR(10) NOT NULL DEFAULT 'DIRECT'
      CHECK (labour_pricing_mode IN ('DIRECT','PENDING'));
    ALTER TABLE sales ADD COLUMN labour_pricing_mode VARCHAR(10) NOT NULL DEFAULT 'DIRECT'
      CHECK (labour_pricing_mode IN ('DIRECT','PENDING'));

    ALTER TABLE pending_entities ALTER COLUMN product_id DROP NOT NULL;
    ALTER TABLE pending_entities ADD COLUMN labour_id VARCHAR(24) REFERENCES labour(id) ON DELETE RESTRICT;
    ALTER TABLE pending_entities ADD COLUMN labour_name VARCHAR(100) NOT NULL DEFAULT '';
    ALTER TABLE pending_entities ADD COLUMN service_name VARCHAR(80) NOT NULL DEFAULT '';
    ALTER TABLE pending_entities ADD COLUMN charged_amount BIGINT
      CHECK (charged_amount IS NULL OR charged_amount >= 0);
    CREATE INDEX pending_entities_labour_idx ON pending_entities (labour_id);

    -- The original CHECKs were unnamed (source_type's column CHECK and the
    -- table-level shape CHECK), so find them by definition rather than name.
    DO $$
    DECLARE c RECORD;
    BEGIN
      FOR c IN
        SELECT conname FROM pg_constraint
        WHERE conrelid = 'pending_entities'::regclass
          AND contype = 'c'
          AND pg_get_constraintdef(oid) LIKE '%source_type%'
      LOOP
        EXECUTE format('ALTER TABLE pending_entities DROP CONSTRAINT %I', c.conname);
      END LOOP;
    END $$;

    ALTER TABLE pending_entities ADD CONSTRAINT pending_entities_source_type_check
      CHECK (source_type IN ('SALE_ITEM','STOCK_RECEIPT_ITEM','SALE_LABOUR'));
    ALTER TABLE pending_entities ADD CONSTRAINT pending_entities_shape_check CHECK (
      (source_type = 'SALE_ITEM' AND sale_id IS NOT NULL AND stock_receipt_id IS NULL
        AND vendor_id IS NOT NULL AND supplier_id IS NULL AND product_id IS NOT NULL)
      OR
      (source_type = 'STOCK_RECEIPT_ITEM' AND stock_receipt_id IS NOT NULL AND sale_id IS NULL
        AND supplier_id IS NOT NULL AND vendor_id IS NULL AND product_id IS NOT NULL)
      OR
      (source_type = 'SALE_LABOUR' AND sale_id IS NOT NULL AND stock_receipt_id IS NULL
        AND labour_id IS NOT NULL AND vendor_id IS NULL AND supplier_id IS NULL)
    );
  `,
    { transaction },
  );
}

module.exports = { name: '024-labour-pricing-mode', up };
