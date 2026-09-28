/**
 * Product returns against a vendor sale — the mirror of sale_returns/
 * sale_return_items, but simpler: every VendorSaleItem line always comes
 * from the vendor sale's single warehouse (no per-line WAREHOUSE/VENDOR
 * source split like a customer Sale has), and vendor sales carry no gate
 * pass today, so a return doesn't need one either.
 */
async function up(db, transaction) {
  await db.query(
    `
    ALTER TABLE journal_entries DROP CONSTRAINT journal_entries_ref_type_check;
    ALTER TABLE journal_entries ADD CONSTRAINT journal_entries_ref_type_check
      CHECK (ref_type IN (
        'SALE','SALE_RETURN','VENDOR_SALE','VENDOR_SALE_RETURN','PURCHASE','PAYMENT','RECEIPT','CASH_ADJUST','EXPENSE','OPENING','PENDING_ENTITY'
      ));

    ALTER TABLE vendor_sales ADD COLUMN returned_total BIGINT NOT NULL DEFAULT 0 CHECK (returned_total >= 0);

    CREATE TABLE vendor_sale_returns (
      id VARCHAR(24) PRIMARY KEY,
      number VARCHAR(40) NOT NULL UNIQUE,
      vendor_sale_id VARCHAR(24) NOT NULL REFERENCES vendor_sales(id) ON DELETE RESTRICT,
      vendor_sale_number VARCHAR(40) NOT NULL,
      vendor_id VARCHAR(24) NOT NULL REFERENCES vendors(id) ON DELETE RESTRICT,
      vendor_name VARCHAR(120) NOT NULL DEFAULT '',
      warehouse_id VARCHAR(24) NOT NULL REFERENCES warehouses(id) ON DELETE RESTRICT,
      date TIMESTAMPTZ NOT NULL DEFAULT now(),

      subtotal BIGINT NOT NULL DEFAULT 0 CHECK (subtotal >= 0),
      discount BIGINT NOT NULL DEFAULT 0 CHECK (discount >= 0),
      tax BIGINT NOT NULL DEFAULT 0 CHECK (tax >= 0),
      total BIGINT NOT NULL DEFAULT 0 CHECK (total >= 0),
      cost BIGINT NOT NULL DEFAULT 0 CHECK (cost >= 0),
      note VARCHAR(500) NOT NULL DEFAULT '',

      created_by_id VARCHAR(24) REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX vendor_sale_returns_vendor_sale_idx ON vendor_sale_returns (vendor_sale_id);
    CREATE INDEX vendor_sale_returns_date_idx ON vendor_sale_returns (date);

    CREATE TABLE vendor_sale_return_items (
      id BIGSERIAL PRIMARY KEY,
      vendor_sale_return_id VARCHAR(24) NOT NULL REFERENCES vendor_sale_returns(id) ON DELETE CASCADE,
      position INTEGER NOT NULL,
      product_id VARCHAR(24) NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
      name VARCHAR(160) NOT NULL,
      quantity NUMERIC(20,6) NOT NULL CHECK (quantity >= 0),
      unit_price BIGINT NOT NULL DEFAULT 0 CHECK (unit_price >= 0),
      line_total BIGINT NOT NULL DEFAULT 0 CHECK (line_total >= 0),
      cost BIGINT NOT NULL DEFAULT 0 CHECK (cost >= 0),
      UNIQUE (vendor_sale_return_id, position)
    );
  `,
    { transaction },
  );
}

module.exports = { name: '016-vendor-sale-returns', up };
