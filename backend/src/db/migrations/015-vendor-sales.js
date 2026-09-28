/**
 * A Vendor today is only a party we buy stock from (AP). This adds the
 * mirror flow — a vendor buying stock from us — as its own document type
 * (vendor_sales / vendor_sale_items), a full sale-style record (line items,
 * discount/tax, payment split, stock deducted) kept separate from the
 * Customer-only `sales` table rather than retrofitted into it, since Sale's
 * credit/balance/gate-pass logic is deeply Customer-specific.
 *
 * Money owed back to us by a vendor-as-buyer is tracked on a new AR_VENDOR
 * ledger account (see utils/finance.js), independent of the existing AP
 * account for what we owe that same vendor for stock sourced from them.
 */
async function up(db, transaction) {
  await db.query(
    `
    ALTER TABLE journal_entries DROP CONSTRAINT journal_entries_ref_type_check;
    ALTER TABLE journal_entries ADD CONSTRAINT journal_entries_ref_type_check
      CHECK (ref_type IN (
        'SALE','SALE_RETURN','VENDOR_SALE','PURCHASE','PAYMENT','RECEIPT','CASH_ADJUST','EXPENSE','OPENING','PENDING_ENTITY'
      ));

    ALTER TABLE journal_lines DROP CONSTRAINT journal_lines_account_check;
    ALTER TABLE journal_lines ADD CONSTRAINT journal_lines_account_check
      CHECK (account IN (
        'CASH','BANK','INVENTORY','AR','AR_VENDOR','AP','AP_SUPPLIER','AP_LABOUR','AP_TRANSPORT',
        'SALES','COGS','OPERATING_EXPENSE','TAX','EQUITY'
      ));

    CREATE TABLE vendor_sales (
      id VARCHAR(24) PRIMARY KEY,
      number VARCHAR(40) NOT NULL UNIQUE,
      vendor_id VARCHAR(24) NOT NULL REFERENCES vendors(id) ON DELETE RESTRICT,
      vendor_name VARCHAR(120) NOT NULL DEFAULT '',
      store_id VARCHAR(24) NOT NULL REFERENCES stores(id) ON DELETE RESTRICT,
      warehouse_id VARCHAR(24) NOT NULL REFERENCES warehouses(id) ON DELETE RESTRICT,
      date TIMESTAMPTZ NOT NULL DEFAULT now(),

      subtotal BIGINT NOT NULL DEFAULT 0 CHECK (subtotal >= 0),
      discount BIGINT NOT NULL DEFAULT 0 CHECK (discount >= 0),
      tax_percent NUMERIC(9,4) NOT NULL DEFAULT 0 CHECK (tax_percent >= 0),
      tax BIGINT NOT NULL DEFAULT 0 CHECK (tax >= 0),
      total BIGINT NOT NULL DEFAULT 0 CHECK (total >= 0),
      cost BIGINT NOT NULL DEFAULT 0 CHECK (cost >= 0),

      payment_method VARCHAR(20) NOT NULL
        CHECK (payment_method IN ('CASH','CARD','BANK_TRANSFER','ONLINE','MIXED','CREDIT')),
      cash_amount BIGINT NOT NULL DEFAULT 0 CHECK (cash_amount >= 0),
      online_amount BIGINT NOT NULL DEFAULT 0 CHECK (online_amount >= 0),
      credit_amount BIGINT NOT NULL DEFAULT 0 CHECK (credit_amount >= 0),
      bank_account_id VARCHAR(24) REFERENCES bank_accounts(id) ON DELETE SET NULL,
      transfer_receipt_ref VARCHAR(300) NOT NULL DEFAULT '',
      note VARCHAR(500) NOT NULL DEFAULT '',

      last_edited_at TIMESTAMPTZ,
      last_edited_by_id VARCHAR(24) REFERENCES users(id) ON DELETE SET NULL,
      created_by_id VARCHAR(24) REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX vendor_sales_vendor_idx ON vendor_sales (vendor_id);
    CREATE INDEX vendor_sales_store_idx ON vendor_sales (store_id);
    CREATE INDEX vendor_sales_warehouse_idx ON vendor_sales (warehouse_id);
    CREATE INDEX vendor_sales_date_idx ON vendor_sales (date);

    CREATE TABLE vendor_sale_items (
      id BIGSERIAL PRIMARY KEY,
      vendor_sale_id VARCHAR(24) NOT NULL REFERENCES vendor_sales(id) ON DELETE CASCADE,
      position INTEGER NOT NULL,
      product_id VARCHAR(24) NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
      name VARCHAR(160) NOT NULL,
      quantity NUMERIC(20,6) NOT NULL CHECK (quantity >= 0),
      unit_price BIGINT NOT NULL DEFAULT 0 CHECK (unit_price >= 0),
      line_total BIGINT NOT NULL DEFAULT 0 CHECK (line_total >= 0),
      cost BIGINT NOT NULL DEFAULT 0 CHECK (cost >= 0),
      UNIQUE (vendor_sale_id, position)
    );

    UPDATE roles
    SET permissions = permissions || ARRAY['vendor-sales:read']::text[]
    WHERE name = 'cashier' AND NOT (permissions @> ARRAY['vendor-sales:read']::text[]);

    UPDATE roles
    SET permissions = permissions || ARRAY['vendor-sales:read']::text[]
    WHERE name = 'accountant' AND NOT (permissions @> ARRAY['vendor-sales:read']::text[]);

    UPDATE roles
    SET permissions = permissions || ARRAY['vendor-sales:read','vendor-sales:manage']::text[]
    WHERE name = 'manager' AND NOT (permissions @> ARRAY['vendor-sales:read']::text[]);

    UPDATE roles
    SET permissions = permissions || ARRAY['vendor-sales:read','vendor-sales:manage']::text[]
    WHERE name = 'admin' AND NOT (permissions @> ARRAY['vendor-sales:read']::text[]);
  `,
    { transaction },
  );
}

module.exports = { name: '015-vendor-sales', up };
