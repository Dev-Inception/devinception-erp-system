/**
 * Full relational schema for the ERP backend, ported from the Mongoose
 * models on `main`. Conventions:
 *  - Root-entity primary keys are app-generated 24-char hex strings
 *    (VARCHAR(24)), matching Mongo ObjectId's shape so the rest of the app
 *    (validators, frontend) didn't need an id-format change.
 *  - Child/line-item tables (one row per embedded-array element in the old
 *    Mongo documents) use BIGSERIAL primary keys plus a `position` column so
 *    the original array order can be restored with `ORDER BY position`.
 *  - Money is integer paisa (BIGINT). Quantities are NUMERIC(20,6) — the app
 *    supports fractional/weighted units rounded to 6 decimal places
 *    (see utils/quantity.js's QUANTITY_DECIMALS), so these are intentionally
 *    NOT integers.
 *  - Case-insensitive "unique name" catalogs use a functional
 *    `UNIQUE (LOWER(col))` index instead of Mongo's collation-based index.
 *  - A few tables (sales.gate_pass_id/vendor_gate_pass_id,
 *    stock_receipts.gate_pass_id) reference gate_passes, which itself
 *    references sales/stock_receipts — those columns are created plain and
 *    the FK is added via ALTER TABLE once gate_passes exists, avoiding a
 *    forward-reference cycle.
 */
async function up(db, transaction) {
  await db.query(
    `
    -- ============================================================
    -- Identity / RBAC
    -- ============================================================
    CREATE TABLE roles (
      id VARCHAR(24) PRIMARY KEY,
      name VARCHAR(100) NOT NULL,
      description VARCHAR(200) NOT NULL DEFAULT '',
      permissions TEXT[] NOT NULL DEFAULT '{}',
      is_system BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    -- Role name is the FK target for users.role and is always lowercased by
    -- the app before write, so a plain UNIQUE constraint (rather than a
    -- LOWER(name) functional index, which Postgres can't use as an FK target)
    -- gives effectively case-insensitive uniqueness.
    ALTER TABLE roles ADD CONSTRAINT roles_name_unique UNIQUE (name);

    -- ============================================================
    -- Locations / catalog
    -- ============================================================
    CREATE TABLE stores (
      id VARCHAR(24) PRIMARY KEY,
      name VARCHAR(120) NOT NULL,
      code VARCHAR(20) NOT NULL DEFAULT '',
      address VARCHAR(300) NOT NULL DEFAULT '',
      is_default BOOLEAN NOT NULL DEFAULT false,
      is_active BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX stores_name_idx ON stores (name);
    CREATE UNIQUE INDEX stores_single_default ON stores (is_default) WHERE is_default = TRUE;

    CREATE TABLE warehouses (
      id VARCHAR(24) PRIMARY KEY,
      name VARCHAR(120) NOT NULL,
      location VARCHAR(120) NOT NULL DEFAULT '',
      address VARCHAR(300) NOT NULL DEFAULT '',
      is_default BOOLEAN NOT NULL DEFAULT false,
      is_active BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX warehouses_name_idx ON warehouses (name);
    CREATE UNIQUE INDEX warehouses_single_default ON warehouses (is_default) WHERE is_default = TRUE;

    -- Store.warehouses[] in Mongo: a many-to-many membership — a warehouse
    -- can be shared by more than one store (see reportService.salesReport,
    -- which already scopes by a sale's own store rather than warehouse
    -- membership for exactly this reason).
    CREATE TABLE store_warehouses (
      store_id VARCHAR(24) NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
      warehouse_id VARCHAR(24) NOT NULL REFERENCES warehouses(id) ON DELETE CASCADE,
      PRIMARY KEY (store_id, warehouse_id)
    );

    CREATE TABLE categories (
      id VARCHAR(24) PRIMARY KEY,
      name VARCHAR(80) NOT NULL,
      description VARCHAR(500) NOT NULL DEFAULT '',
      is_active BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE UNIQUE INDEX categories_name_ci_unique ON categories (LOWER(name));

    CREATE TABLE brands (
      id VARCHAR(24) PRIMARY KEY,
      name VARCHAR(80) NOT NULL,
      is_active BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE UNIQUE INDEX brands_name_ci_unique ON brands (LOWER(name));

    CREATE TABLE units (
      id VARCHAR(24) PRIMARY KEY,
      name VARCHAR(40) NOT NULL,
      abbreviation VARCHAR(20) NOT NULL DEFAULT '',
      is_active BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE UNIQUE INDEX units_name_ci_unique ON units (LOWER(name));

    CREATE TABLE expense_categories (
      id VARCHAR(24) PRIMARY KEY,
      name VARCHAR(80) NOT NULL,
      description VARCHAR(500) NOT NULL DEFAULT '',
      is_active BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE UNIQUE INDEX expense_categories_name_ci_unique ON expense_categories (LOWER(name));

    CREATE TABLE products (
      id VARCHAR(24) PRIMARY KEY,
      name VARCHAR(160) NOT NULL,
      sku VARCHAR(60) NOT NULL DEFAULT '',
      barcode VARCHAR(60) NOT NULL DEFAULT '',
      warehouse_id VARCHAR(24) REFERENCES warehouses(id) ON DELETE SET NULL,
      category_id VARCHAR(24) REFERENCES categories(id) ON DELETE SET NULL,
      brand_id VARCHAR(24) REFERENCES brands(id) ON DELETE SET NULL,
      unit_id VARCHAR(24) REFERENCES units(id) ON DELETE SET NULL,
      purchase_price BIGINT NOT NULL DEFAULT 0 CHECK (purchase_price >= 0),
      sale_price BIGINT NOT NULL DEFAULT 0 CHECK (sale_price >= 0),
      tax_percent NUMERIC(9,4) NOT NULL DEFAULT 0 CHECK (tax_percent >= 0),
      min_stock NUMERIC(20,6) NOT NULL DEFAULT 0 CHECK (min_stock >= 0),
      is_active BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX products_name_idx ON products (name);
    CREATE INDEX products_warehouse_idx ON products (warehouse_id);
    CREATE UNIQUE INDEX products_sku_unique ON products (sku) WHERE sku <> '';

    -- ============================================================
    -- Parties
    -- ============================================================
    CREATE TABLE customers (
      id VARCHAR(24) PRIMARY KEY,
      name VARCHAR(120) NOT NULL,
      phone VARCHAR(30) NOT NULL DEFAULT '',
      email VARCHAR(120) NOT NULL DEFAULT '',
      address VARCHAR(300) NOT NULL DEFAULT '',
      store_id VARCHAR(24) REFERENCES stores(id) ON DELETE SET NULL,
      credit_limit BIGINT NOT NULL DEFAULT 0 CHECK (credit_limit >= 0),
      outstanding BIGINT NOT NULL DEFAULT 0 CHECK (outstanding >= 0),
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX customers_name_idx ON customers (name);
    CREATE INDEX customers_store_idx ON customers (store_id);

    CREATE TABLE vendors (
      id VARCHAR(24) PRIMARY KEY,
      name VARCHAR(120) NOT NULL,
      phone VARCHAR(30) NOT NULL DEFAULT '',
      email VARCHAR(120) NOT NULL DEFAULT '',
      ntn VARCHAR(40) NOT NULL DEFAULT '',
      address VARCHAR(300) NOT NULL DEFAULT '',
      outstanding BIGINT NOT NULL DEFAULT 0 CHECK (outstanding >= 0),
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX vendors_name_idx ON vendors (name);

    CREATE TABLE suppliers (
      id VARCHAR(24) PRIMARY KEY,
      name VARCHAR(120) NOT NULL,
      phone VARCHAR(30) NOT NULL DEFAULT '',
      email VARCHAR(120) NOT NULL DEFAULT '',
      ntn VARCHAR(40) NOT NULL DEFAULT '',
      address VARCHAR(300) NOT NULL DEFAULT '',
      outstanding BIGINT NOT NULL DEFAULT 0 CHECK (outstanding >= 0),
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX suppliers_name_idx ON suppliers (name);

    CREATE TABLE transporters (
      id VARCHAR(24) PRIMARY KEY,
      name VARCHAR(120) NOT NULL,
      phone VARCHAR(30) NOT NULL DEFAULT '',
      vehicle_number VARCHAR(40) NOT NULL DEFAULT '',
      address VARCHAR(300) NOT NULL DEFAULT '',
      outstanding BIGINT NOT NULL DEFAULT 0 CHECK (outstanding >= 0),
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX transporters_name_idx ON transporters (name);

    CREATE TABLE bank_accounts (
      id VARCHAR(24) PRIMARY KEY,
      name VARCHAR(120) NOT NULL,
      bank_name VARCHAR(120) NOT NULL DEFAULT '',
      account_number VARCHAR(60) NOT NULL DEFAULT '',
      store_id VARCHAR(24) REFERENCES stores(id) ON DELETE SET NULL,
      is_active BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX bank_accounts_name_idx ON bank_accounts (name);
    CREATE INDEX bank_accounts_store_idx ON bank_accounts (store_id);

    CREATE TABLE labour (
      id VARCHAR(24) PRIMARY KEY,
      name VARCHAR(100) NOT NULL,
      phone_number VARCHAR(20) NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE UNIQUE INDEX labour_phone_number_unique ON labour (phone_number);

    CREATE TABLE users (
      id VARCHAR(24) PRIMARY KEY,
      name VARCHAR(80) NOT NULL,
      email VARCHAR(255) NOT NULL,
      password VARCHAR(255) NOT NULL,
      role VARCHAR(100) NOT NULL DEFAULT 'cashier' REFERENCES roles(name) ON DELETE RESTRICT,
      is_active BOOLEAN NOT NULL DEFAULT true,
      store_id VARCHAR(24) REFERENCES stores(id) ON DELETE SET NULL,
      password_reset_token VARCHAR(255),
      password_reset_expires TIMESTAMPTZ,
      password_changed_at TIMESTAMPTZ,
      token_version INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE UNIQUE INDEX users_email_ci_unique ON users (LOWER(email));
    CREATE INDEX users_role_idx ON users (role);
    CREATE INDEX users_store_idx ON users (store_id);

    -- ============================================================
    -- Accounting (created early: journal_lines.ref_id is a polymorphic,
    -- unconstrained column, so the ledger has no forward-reference issues
    -- and other modules — expenses, sales, receipts — can reference
    -- journal_entries directly).
    -- ============================================================
    CREATE TABLE journal_entries (
      id VARCHAR(24) PRIMARY KEY,
      date TIMESTAMPTZ NOT NULL DEFAULT now(),
      description VARCHAR(500) NOT NULL DEFAULT '',
      ref_type VARCHAR(30) NOT NULL CHECK (ref_type IN (
        'SALE','SALE_RETURN','PURCHASE','PAYMENT','RECEIPT','CASH_ADJUST','EXPENSE','OPENING','PENDING_ENTITY'
      )),
      -- Polymorphic pointer to the source document (Sale/SaleReturn/StockReceipt/...);
      -- no FK constraint since the target table depends on ref_type.
      ref_id VARCHAR(24),
      ref_no VARCHAR(100) NOT NULL DEFAULT '',
      warehouse_id VARCHAR(24) REFERENCES warehouses(id) ON DELETE SET NULL,
      store_id VARCHAR(24) REFERENCES stores(id) ON DELETE SET NULL,
      created_by_id VARCHAR(24) REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX journal_entries_ref_type_idx ON journal_entries (ref_type);
    CREATE INDEX journal_entries_ref_no_idx ON journal_entries (ref_no);
    CREATE INDEX journal_entries_warehouse_idx ON journal_entries (warehouse_id);
    CREATE INDEX journal_entries_store_idx ON journal_entries (store_id);
    CREATE INDEX journal_entries_date_idx ON journal_entries (date);

    CREATE TABLE journal_lines (
      id BIGSERIAL PRIMARY KEY,
      journal_entry_id VARCHAR(24) NOT NULL REFERENCES journal_entries(id) ON DELETE CASCADE,
      position INTEGER NOT NULL,
      account VARCHAR(30) NOT NULL CHECK (account IN (
        'CASH','BANK','INVENTORY','AR','AP','AP_SUPPLIER','AP_LABOUR','AP_TRANSPORT',
        'SALES','COGS','OPERATING_EXPENSE','TAX','EQUITY'
      )),
      -- Polymorphic party pointer (Customer/Vendor/Supplier/Labour/Transporter/
      -- BankAccount depending on the account column); no FK, validated by account kind
      -- in the application layer, same as the source Mongo model.
      ref_id VARCHAR(24),
      debit BIGINT NOT NULL DEFAULT 0 CHECK (debit >= 0),
      credit BIGINT NOT NULL DEFAULT 0 CHECK (credit >= 0),
      CHECK ((debit > 0 AND credit = 0) OR (credit > 0 AND debit = 0)),
      UNIQUE (journal_entry_id, position)
    );
    CREATE INDEX journal_lines_account_ref_idx ON journal_lines (account, ref_id);

    -- Enforces "every journal entry has >=2 balanced lines" at commit time,
    -- deferred so the entry + all of its lines can be inserted as separate
    -- statements within one transaction before the check runs.
    CREATE OR REPLACE FUNCTION enforce_balanced_journal_entry() RETURNS TRIGGER AS $BODY$
    DECLARE
      entry_id VARCHAR(24);
      line_count BIGINT;
      debit_total NUMERIC;
      credit_total NUMERIC;
    BEGIN
      entry_id := COALESCE(NEW.journal_entry_id, OLD.journal_entry_id);
      SELECT COUNT(*), COALESCE(SUM(debit), 0), COALESCE(SUM(credit), 0)
        INTO line_count, debit_total, credit_total
        FROM journal_lines WHERE journal_entry_id = entry_id;
      IF line_count < 2 OR debit_total <> credit_total THEN
        RAISE EXCEPTION 'Journal entry % must have at least two balanced lines', entry_id;
      END IF;
      RETURN NULL;
    END;
    $BODY$ LANGUAGE plpgsql;

    CREATE CONSTRAINT TRIGGER journal_lines_balanced
      AFTER INSERT OR UPDATE OR DELETE ON journal_lines
      DEFERRABLE INITIALLY DEFERRED
      FOR EACH ROW EXECUTE FUNCTION enforce_balanced_journal_entry();

    CREATE TABLE counters (
      key VARCHAR(30) NOT NULL,
      scope VARCHAR(30) NOT NULL DEFAULT '',
      seq BIGINT NOT NULL DEFAULT 0,
      PRIMARY KEY (key, scope)
    );

    CREATE TABLE settings (
      id VARCHAR(24) PRIMARY KEY,
      key VARCHAR(20) NOT NULL DEFAULT 'app',
      company_name VARCHAR(200) NOT NULL DEFAULT '',
      address VARCHAR(300) NOT NULL DEFAULT '',
      phone VARCHAR(40) NOT NULL DEFAULT '',
      email VARCHAR(120) NOT NULL DEFAULT '',
      tax_number VARCHAR(60) NOT NULL DEFAULT '',
      currency VARCHAR(10) NOT NULL DEFAULT 'PKR',
      invoice_note VARCHAR(1000) NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (key)
    );

    -- ============================================================
    -- Inventory
    -- ============================================================
    CREATE TABLE stock_levels (
      id BIGSERIAL PRIMARY KEY,
      product_id VARCHAR(24) NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
      warehouse_id VARCHAR(24) NOT NULL REFERENCES warehouses(id) ON DELETE RESTRICT,
      quantity NUMERIC(20,6) NOT NULL DEFAULT 0,
      avg_cost NUMERIC(30,12) NOT NULL DEFAULT 0 CHECK (avg_cost >= 0),
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (product_id, warehouse_id)
    );

    CREATE TABLE stock_movements (
      id BIGSERIAL PRIMARY KEY,
      product_id VARCHAR(24) NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
      warehouse_id VARCHAR(24) NOT NULL REFERENCES warehouses(id) ON DELETE RESTRICT,
      type VARCHAR(10) NOT NULL CHECK (type IN ('IN','OUT','ADJUST')),
      quantity NUMERIC(20,6) NOT NULL,
      unit_cost NUMERIC(30,12) NOT NULL DEFAULT 0 CHECK (unit_cost >= 0),
      total_cost BIGINT CHECK (total_cost IS NULL OR total_cost >= 0),
      ref_type VARCHAR(50) NOT NULL DEFAULT '',
      ref_no VARCHAR(100) NOT NULL DEFAULT '',
      date TIMESTAMPTZ NOT NULL DEFAULT now(),
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX stock_movements_product_idx ON stock_movements (product_id);
    CREATE INDEX stock_movements_date_idx ON stock_movements (date);

    -- ============================================================
    -- Sales
    -- ============================================================
    CREATE TABLE sales (
      id VARCHAR(24) PRIMARY KEY,
      number VARCHAR(40) NOT NULL UNIQUE,
      customer_id VARCHAR(24) REFERENCES customers(id) ON DELETE SET NULL,
      customer_name VARCHAR(120) NOT NULL DEFAULT 'Walk-in',
      store_id VARCHAR(24) NOT NULL REFERENCES stores(id) ON DELETE RESTRICT,
      warehouse_id VARCHAR(24) NOT NULL REFERENCES warehouses(id) ON DELETE RESTRICT,
      date TIMESTAMPTZ NOT NULL DEFAULT now(),
      transport_driver_name VARCHAR(120) NOT NULL DEFAULT '',
      transport_driver_phone VARCHAR(40) NOT NULL DEFAULT '',
      transport_vehicle_number VARCHAR(40) NOT NULL DEFAULT '',
      transporter_id VARCHAR(24) REFERENCES transporters(id) ON DELETE SET NULL,
      transport_fare_method VARCHAR(30),
      transport_fare_bank_account_id VARCHAR(24) REFERENCES bank_accounts(id) ON DELETE SET NULL,
      subtotal BIGINT NOT NULL CHECK (subtotal >= 0),
      discount BIGINT NOT NULL DEFAULT 0 CHECK (discount >= 0),
      tax_percent NUMERIC(9,4) NOT NULL DEFAULT 0 CHECK (tax_percent >= 0),
      tax BIGINT NOT NULL DEFAULT 0 CHECK (tax >= 0),
      transport_fare BIGINT NOT NULL DEFAULT 0 CHECK (transport_fare >= 0),
      labour_rent BIGINT NOT NULL DEFAULT 0 CHECK (labour_rent >= 0),
      total BIGINT NOT NULL CHECK (total >= 0),
      cost BIGINT NOT NULL DEFAULT 0 CHECK (cost >= 0),
      payment_method VARCHAR(20) NOT NULL CHECK (payment_method IN ('CASH','CARD','BANK_TRANSFER','ONLINE','MIXED','CREDIT')),
      cash_amount BIGINT NOT NULL DEFAULT 0 CHECK (cash_amount >= 0),
      online_amount BIGINT NOT NULL DEFAULT 0 CHECK (online_amount >= 0),
      credit_amount BIGINT NOT NULL DEFAULT 0 CHECK (credit_amount >= 0),
      additional_paid_amount BIGINT NOT NULL DEFAULT 0 CHECK (additional_paid_amount >= 0),
      returned_total BIGINT NOT NULL DEFAULT 0 CHECK (returned_total >= 0),
      bank_account_id VARCHAR(24) REFERENCES bank_accounts(id) ON DELETE SET NULL,
      transfer_receipt_ref VARCHAR(300) NOT NULL DEFAULT '',
      last_edited_at TIMESTAMPTZ,
      last_edited_by_id VARCHAR(24) REFERENCES users(id) ON DELETE SET NULL,
      -- FKs to gate_passes added by ALTER TABLE below, once that table exists.
      gate_pass_id VARCHAR(24),
      vendor_gate_pass_id VARCHAR(24),
      created_by_id VARCHAR(24) REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX sales_customer_idx ON sales (customer_id);
    CREATE INDEX sales_store_idx ON sales (store_id);
    CREATE INDEX sales_date_idx ON sales (date);

    CREATE TABLE sale_items (
      id BIGSERIAL PRIMARY KEY,
      sale_id VARCHAR(24) NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
      position INTEGER NOT NULL,
      product_id VARCHAR(24) NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
      name VARCHAR(160) NOT NULL,
      quantity NUMERIC(20,6) NOT NULL CHECK (quantity >= 0),
      unit_price BIGINT NOT NULL CHECK (unit_price >= 0),
      line_total BIGINT NOT NULL CHECK (line_total >= 0),
      cost BIGINT NOT NULL DEFAULT 0 CHECK (cost >= 0),
      source VARCHAR(10) NOT NULL DEFAULT 'WAREHOUSE' CHECK (source IN ('WAREHOUSE','VENDOR')),
      warehouse_id VARCHAR(24) REFERENCES warehouses(id) ON DELETE RESTRICT,
      vendor_id VARCHAR(24) REFERENCES vendors(id) ON DELETE RESTRICT,
      vendor_name VARCHAR(120) NOT NULL DEFAULT '',
      UNIQUE (sale_id, position)
    );

    CREATE TABLE sale_labour (
      id BIGSERIAL PRIMARY KEY,
      sale_id VARCHAR(24) NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
      position INTEGER NOT NULL,
      labour_id VARCHAR(24) NOT NULL REFERENCES labour(id) ON DELETE RESTRICT,
      name VARCHAR(100) NOT NULL,
      phone_number VARCHAR(20) NOT NULL DEFAULT '',
      rent BIGINT NOT NULL DEFAULT 0 CHECK (rent >= 0),
      UNIQUE (sale_id, position)
    );

    -- Private per-cashier POS scratch state (SaleDraft). Never joined or
    -- aggregated in SQL, so items/labour/customer/driver stay as JSONB
    -- rather than normalized child tables.
    CREATE TABLE sale_drafts (
      id VARCHAR(24) PRIMARY KEY,
      created_by_id VARCHAR(24) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      store_id VARCHAR(24) REFERENCES stores(id) ON DELETE SET NULL,
      step INTEGER NOT NULL DEFAULT 1 CHECK (step BETWEEN 1 AND 5),
      customer JSONB NOT NULL DEFAULT '{}'::jsonb,
      items JSONB NOT NULL DEFAULT '[]'::jsonb,
      labour JSONB NOT NULL DEFAULT '[]'::jsonb,
      driver JSONB NOT NULL DEFAULT '{}'::jsonb,
      transport_fare BIGINT NOT NULL DEFAULT 0 CHECK (transport_fare >= 0),
      discount_value BIGINT NOT NULL DEFAULT 0 CHECK (discount_value >= 0),
      discount_type VARCHAR(10) NOT NULL DEFAULT 'amount' CHECK (discount_type IN ('amount','percent')),
      tax_pct NUMERIC(9,4) NOT NULL DEFAULT 0 CHECK (tax_pct >= 0),
      advance_amount BIGINT NOT NULL DEFAULT 0 CHECK (advance_amount >= 0),
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX sale_drafts_created_by_idx ON sale_drafts (created_by_id);
    CREATE INDEX sale_drafts_store_idx ON sale_drafts (store_id);

    CREATE TABLE sale_returns (
      id VARCHAR(24) PRIMARY KEY,
      number VARCHAR(40) NOT NULL UNIQUE,
      sale_id VARCHAR(24) NOT NULL REFERENCES sales(id) ON DELETE RESTRICT,
      sale_number VARCHAR(40) NOT NULL,
      customer_id VARCHAR(24) REFERENCES customers(id) ON DELETE SET NULL,
      customer_name VARCHAR(120) NOT NULL DEFAULT '',
      date TIMESTAMPTZ NOT NULL DEFAULT now(),
      subtotal BIGINT NOT NULL CHECK (subtotal >= 0),
      discount BIGINT NOT NULL DEFAULT 0 CHECK (discount >= 0),
      tax BIGINT NOT NULL DEFAULT 0 CHECK (tax >= 0),
      total BIGINT NOT NULL CHECK (total >= 0),
      cost BIGINT NOT NULL DEFAULT 0 CHECK (cost >= 0),
      note VARCHAR(500) NOT NULL DEFAULT '',
      created_by_id VARCHAR(24) REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX sale_returns_sale_idx ON sale_returns (sale_id);
    CREATE INDEX sale_returns_date_idx ON sale_returns (date);

    CREATE TABLE sale_return_items (
      id BIGSERIAL PRIMARY KEY,
      sale_return_id VARCHAR(24) NOT NULL REFERENCES sale_returns(id) ON DELETE CASCADE,
      position INTEGER NOT NULL,
      product_id VARCHAR(24) NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
      name VARCHAR(160) NOT NULL,
      quantity NUMERIC(20,6) NOT NULL CHECK (quantity >= 0),
      unit_price BIGINT NOT NULL CHECK (unit_price >= 0),
      line_total BIGINT NOT NULL CHECK (line_total >= 0),
      cost BIGINT NOT NULL DEFAULT 0 CHECK (cost >= 0),
      source VARCHAR(10) NOT NULL DEFAULT 'WAREHOUSE' CHECK (source IN ('WAREHOUSE','VENDOR')),
      warehouse_id VARCHAR(24) REFERENCES warehouses(id) ON DELETE RESTRICT,
      UNIQUE (sale_return_id, position)
    );

    -- ============================================================
    -- Purchasing
    -- ============================================================
    CREATE TABLE stock_receipts (
      id VARCHAR(24) PRIMARY KEY,
      number VARCHAR(40) NOT NULL UNIQUE,
      supplier_id VARCHAR(24) NOT NULL REFERENCES suppliers(id) ON DELETE RESTRICT,
      supplier_name VARCHAR(120) NOT NULL DEFAULT '',
      store_id VARCHAR(24) NOT NULL REFERENCES stores(id) ON DELETE RESTRICT,
      warehouse_id VARCHAR(24) NOT NULL REFERENCES warehouses(id) ON DELETE RESTRICT,
      date TIMESTAMPTZ NOT NULL DEFAULT now(),
      is_opening_stock BOOLEAN NOT NULL DEFAULT false,
      truck_vehicle_number VARCHAR(80) NOT NULL DEFAULT '',
      truck_driver_name VARCHAR(120) NOT NULL DEFAULT '',
      truck_driver_phone VARCHAR(40) NOT NULL DEFAULT '',
      transporter_id VARCHAR(24) REFERENCES transporters(id) ON DELETE SET NULL,
      truck_fare BIGINT NOT NULL DEFAULT 0 CHECK (truck_fare >= 0),
      truck_fare_paid_by VARCHAR(10) NOT NULL DEFAULT 'SUPPLIER' CHECK (truck_fare_paid_by IN ('SUPPLIER','US')),
      truck_fare_method VARCHAR(30),
      truck_fare_bank_account_id VARCHAR(24) REFERENCES bank_accounts(id) ON DELETE SET NULL,
      labour_rent BIGINT NOT NULL DEFAULT 0 CHECK (labour_rent >= 0),
      note VARCHAR(500) NOT NULL DEFAULT '',
      additional_paid_amount BIGINT NOT NULL DEFAULT 0 CHECK (additional_paid_amount >= 0),
      created_by_id VARCHAR(24) REFERENCES users(id) ON DELETE SET NULL,
      -- FK to gate_passes added by ALTER TABLE below, once that table exists.
      gate_pass_id VARCHAR(24),
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX stock_receipts_supplier_idx ON stock_receipts (supplier_id);
    CREATE INDEX stock_receipts_store_idx ON stock_receipts (store_id);
    CREATE INDEX stock_receipts_warehouse_idx ON stock_receipts (warehouse_id);
    CREATE INDEX stock_receipts_date_idx ON stock_receipts (date);

    CREATE TABLE stock_receipt_items (
      id BIGSERIAL PRIMARY KEY,
      stock_receipt_id VARCHAR(24) NOT NULL REFERENCES stock_receipts(id) ON DELETE CASCADE,
      position INTEGER NOT NULL,
      product_id VARCHAR(24) NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
      name VARCHAR(160) NOT NULL,
      received_quantity NUMERIC(20,6) NOT NULL DEFAULT 0 CHECK (received_quantity >= 0),
      damaged_quantity NUMERIC(20,6) NOT NULL DEFAULT 0 CHECK (damaged_quantity >= 0),
      UNIQUE (stock_receipt_id, position)
    );

    CREATE TABLE stock_receipt_labour (
      id BIGSERIAL PRIMARY KEY,
      stock_receipt_id VARCHAR(24) NOT NULL REFERENCES stock_receipts(id) ON DELETE CASCADE,
      position INTEGER NOT NULL,
      labour_id VARCHAR(24) NOT NULL REFERENCES labour(id) ON DELETE RESTRICT,
      name VARCHAR(100) NOT NULL,
      phone_number VARCHAR(20) NOT NULL DEFAULT '',
      rent BIGINT NOT NULL DEFAULT 0 CHECK (rent >= 0),
      UNIQUE (stock_receipt_id, position)
    );

    -- ============================================================
    -- Estimates (sales quotes)
    -- ============================================================
    CREATE TABLE estimates (
      id VARCHAR(24) PRIMARY KEY,
      number VARCHAR(40) NOT NULL UNIQUE,
      customer_id VARCHAR(24) REFERENCES customers(id) ON DELETE SET NULL,
      customer_name VARCHAR(120) NOT NULL,
      customer_phone VARCHAR(40) NOT NULL DEFAULT '',
      customer_address VARCHAR(240) NOT NULL DEFAULT '',
      store_id VARCHAR(24) NOT NULL REFERENCES stores(id) ON DELETE RESTRICT,
      date TIMESTAMPTZ NOT NULL DEFAULT now(),
      subtotal BIGINT NOT NULL CHECK (subtotal >= 0),
      discount BIGINT NOT NULL DEFAULT 0 CHECK (discount >= 0),
      tax_percent NUMERIC(9,4) NOT NULL DEFAULT 0 CHECK (tax_percent >= 0),
      tax BIGINT NOT NULL DEFAULT 0 CHECK (tax >= 0),
      total BIGINT NOT NULL CHECK (total >= 0),
      notes VARCHAR(1000) NOT NULL DEFAULT '',
      status VARCHAR(20) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','FOLLOWED_UP','CONVERTED','LOST')),
      next_follow_up_date TIMESTAMPTZ,
      lost_reason VARCHAR(500) NOT NULL DEFAULT '',
      converted_sale_id VARCHAR(24) REFERENCES sales(id) ON DELETE SET NULL,
      converted_at TIMESTAMPTZ,
      created_by_id VARCHAR(24) REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX estimates_store_idx ON estimates (store_id);
    CREATE INDEX estimates_date_idx ON estimates (date);
    CREATE INDEX estimates_status_idx ON estimates (status);
    CREATE INDEX estimates_next_follow_up_idx ON estimates (next_follow_up_date);

    CREATE TABLE estimate_items (
      id BIGSERIAL PRIMARY KEY,
      estimate_id VARCHAR(24) NOT NULL REFERENCES estimates(id) ON DELETE CASCADE,
      position INTEGER NOT NULL,
      product_id VARCHAR(24) NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
      name VARCHAR(160) NOT NULL,
      quantity NUMERIC(20,6) NOT NULL CHECK (quantity >= 0),
      unit_price BIGINT NOT NULL CHECK (unit_price >= 0),
      line_total BIGINT NOT NULL CHECK (line_total >= 0),
      UNIQUE (estimate_id, position)
    );

    CREATE TABLE estimate_follow_ups (
      id BIGSERIAL PRIMARY KEY,
      estimate_id VARCHAR(24) NOT NULL REFERENCES estimates(id) ON DELETE CASCADE,
      position INTEGER NOT NULL,
      date TIMESTAMPTZ NOT NULL DEFAULT now(),
      note VARCHAR(500) NOT NULL,
      by_id VARCHAR(24) REFERENCES users(id) ON DELETE SET NULL,
      UNIQUE (estimate_id, position)
    );

    -- ============================================================
    -- Pending entities (unpriced vendor/supplier lines)
    -- ============================================================
    CREATE TABLE pending_entities (
      id VARCHAR(24) PRIMARY KEY,
      source_type VARCHAR(20) NOT NULL CHECK (source_type IN ('SALE_ITEM','STOCK_RECEIPT_ITEM')),
      sale_id VARCHAR(24) REFERENCES sales(id) ON DELETE RESTRICT,
      stock_receipt_id VARCHAR(24) REFERENCES stock_receipts(id) ON DELETE RESTRICT,
      source_no VARCHAR(40) NOT NULL DEFAULT '',
      vendor_id VARCHAR(24) REFERENCES vendors(id) ON DELETE RESTRICT,
      vendor_name VARCHAR(120) NOT NULL DEFAULT '',
      supplier_id VARCHAR(24) REFERENCES suppliers(id) ON DELETE RESTRICT,
      supplier_name VARCHAR(120) NOT NULL DEFAULT '',
      product_id VARCHAR(24) NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
      product_name VARCHAR(160) NOT NULL DEFAULT '',
      quantity NUMERIC(20,6) NOT NULL CHECK (quantity >= 0),
      store_id VARCHAR(24) REFERENCES stores(id) ON DELETE SET NULL,
      warehouse_id VARCHAR(24) REFERENCES warehouses(id) ON DELETE SET NULL,
      date TIMESTAMPTZ NOT NULL DEFAULT now(),
      status VARCHAR(10) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','PRICED')),
      purchase_price BIGINT CHECK (purchase_price IS NULL OR purchase_price >= 0),
      line_total BIGINT CHECK (line_total IS NULL OR line_total >= 0),
      priced_by_id VARCHAR(24) REFERENCES users(id) ON DELETE SET NULL,
      priced_at TIMESTAMPTZ,
      created_by_id VARCHAR(24) REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      CHECK (
        (source_type = 'SALE_ITEM' AND sale_id IS NOT NULL AND stock_receipt_id IS NULL
          AND vendor_id IS NOT NULL AND supplier_id IS NULL)
        OR
        (source_type = 'STOCK_RECEIPT_ITEM' AND stock_receipt_id IS NOT NULL AND sale_id IS NULL
          AND supplier_id IS NOT NULL AND vendor_id IS NULL)
      )
    );
    CREATE INDEX pending_entities_vendor_idx ON pending_entities (vendor_id);
    CREATE INDEX pending_entities_supplier_idx ON pending_entities (supplier_id);
    CREATE INDEX pending_entities_store_idx ON pending_entities (store_id);
    CREATE INDEX pending_entities_status_date_idx ON pending_entities (status, date DESC);

    -- ============================================================
    -- Gate passes (created last among the "source" tables since it
    -- references sales, sale_returns and stock_receipts directly)
    -- ============================================================
    CREATE TABLE gate_passes (
      id VARCHAR(24) PRIMARY KEY,
      number VARCHAR(40) NOT NULL UNIQUE,
      token VARCHAR(64) NOT NULL UNIQUE,
      source_type VARCHAR(10) NOT NULL DEFAULT 'SALE' CHECK (source_type IN ('SALE','RETURN','PURCHASE')),
      sale_id VARCHAR(24) REFERENCES sales(id) ON DELETE RESTRICT,
      sale_return_id VARCHAR(24) REFERENCES sale_returns(id) ON DELETE RESTRICT,
      stock_receipt_id VARCHAR(24) REFERENCES stock_receipts(id) ON DELETE RESTRICT,
      kind VARCHAR(10) NOT NULL DEFAULT 'CUSTOMER' CHECK (kind IN ('CUSTOMER','VENDOR')),
      document_number VARCHAR(40) NOT NULL,
      party_name VARCHAR(120) NOT NULL DEFAULT '',
      store_id VARCHAR(24) REFERENCES stores(id) ON DELETE SET NULL,
      warehouse_id VARCHAR(24) NOT NULL REFERENCES warehouses(id) ON DELETE RESTRICT,
      sale_date TIMESTAMPTZ NOT NULL,
      status VARCHAR(12) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','PROCESSED','CANCELLED','ACTIVE','USED')),
      driver_name VARCHAR(120),
      driver_phone VARCHAR(40),
      driver_license_number VARCHAR(80),
      driver_vehicle_number VARCHAR(80),
      load_notes VARCHAR(1000) NOT NULL DEFAULT '',
      signature_data TEXT,
      processed_at TIMESTAMPTZ,
      processed_by_id VARCHAR(24) REFERENCES users(id) ON DELETE SET NULL,
      last_edited_at TIMESTAMPTZ,
      last_edited_by_id VARCHAR(24) REFERENCES users(id) ON DELETE SET NULL,
      created_by_id VARCHAR(24) REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      CHECK (
        (source_type = 'SALE' AND sale_id IS NOT NULL AND sale_return_id IS NULL AND stock_receipt_id IS NULL)
        OR
        (source_type = 'RETURN' AND sale_return_id IS NOT NULL AND sale_id IS NOT NULL AND stock_receipt_id IS NULL)
        OR
        (source_type = 'PURCHASE' AND stock_receipt_id IS NOT NULL AND sale_id IS NULL AND sale_return_id IS NULL)
      )
    );
    CREATE INDEX gate_passes_source_type_idx ON gate_passes (source_type);
    CREATE INDEX gate_passes_store_idx ON gate_passes (store_id);
    CREATE INDEX gate_passes_warehouse_idx ON gate_passes (warehouse_id);
    CREATE INDEX gate_passes_status_idx ON gate_passes (status);
    -- One CUSTOMER/VENDOR pass per (sale, kind, warehouse), excluding RETURN passes.
    CREATE UNIQUE INDEX gate_passes_sale_kind_warehouse_unique
      ON gate_passes (sale_id, kind, warehouse_id)
      WHERE sale_id IS NOT NULL AND sale_return_id IS NULL;
    -- One RETURN pass per (return, warehouse).
    CREATE UNIQUE INDEX gate_passes_return_warehouse_unique
      ON gate_passes (sale_return_id, warehouse_id)
      WHERE sale_return_id IS NOT NULL;
    -- One PURCHASE pass per stock receipt.
    CREATE UNIQUE INDEX gate_passes_stock_receipt_unique
      ON gate_passes (stock_receipt_id)
      WHERE stock_receipt_id IS NOT NULL;

    CREATE TABLE gate_pass_items (
      id BIGSERIAL PRIMARY KEY,
      gate_pass_id VARCHAR(24) NOT NULL REFERENCES gate_passes(id) ON DELETE CASCADE,
      position INTEGER NOT NULL,
      product_id VARCHAR(24) NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
      name VARCHAR(160) NOT NULL,
      sku VARCHAR(60) NOT NULL DEFAULT '',
      barcode VARCHAR(60) NOT NULL DEFAULT '',
      quantity NUMERIC(20,6) NOT NULL CHECK (quantity >= 0),
      loaded_quantity NUMERIC(20,6),
      load_confirmed BOOLEAN NOT NULL DEFAULT false,
      UNIQUE (gate_pass_id, position)
    );

    CREATE TABLE sale_warehouse_gate_passes (
      id BIGSERIAL PRIMARY KEY,
      sale_id VARCHAR(24) NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
      warehouse_id VARCHAR(24) NOT NULL REFERENCES warehouses(id) ON DELETE RESTRICT,
      gate_pass_id VARCHAR(24) NOT NULL REFERENCES gate_passes(id) ON DELETE RESTRICT,
      UNIQUE (sale_id, warehouse_id)
    );

    CREATE TABLE return_warehouse_gate_passes (
      id BIGSERIAL PRIMARY KEY,
      sale_return_id VARCHAR(24) NOT NULL REFERENCES sale_returns(id) ON DELETE CASCADE,
      warehouse_id VARCHAR(24) NOT NULL REFERENCES warehouses(id) ON DELETE RESTRICT,
      gate_pass_id VARCHAR(24) NOT NULL REFERENCES gate_passes(id) ON DELETE RESTRICT,
      UNIQUE (sale_return_id, warehouse_id)
    );

    -- ============================================================
    -- Expenses
    -- ============================================================
    CREATE TABLE expenses (
      id VARCHAR(24) PRIMARY KEY,
      number VARCHAR(40) NOT NULL UNIQUE,
      category_id VARCHAR(24) NOT NULL REFERENCES expense_categories(id) ON DELETE RESTRICT,
      category_name VARCHAR(80) NOT NULL,
      amount BIGINT NOT NULL CHECK (amount >= 0),
      method VARCHAR(20) NOT NULL CHECK (method IN ('CASH','CARD','BANK_TRANSFER','ONLINE')),
      bank_account_id VARCHAR(24) REFERENCES bank_accounts(id) ON DELETE SET NULL,
      store_id VARCHAR(24) NOT NULL REFERENCES stores(id) ON DELETE RESTRICT,
      warehouse_id VARCHAR(24) REFERENCES warehouses(id) ON DELETE SET NULL,
      date TIMESTAMPTZ NOT NULL DEFAULT now(),
      note VARCHAR(500) NOT NULL DEFAULT '',
      status VARCHAR(10) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','APPROVED','REJECTED')),
      approved_by_id VARCHAR(24) REFERENCES users(id) ON DELETE SET NULL,
      approved_at TIMESTAMPTZ,
      rejected_by_id VARCHAR(24) REFERENCES users(id) ON DELETE SET NULL,
      rejected_at TIMESTAMPTZ,
      rejection_reason VARCHAR(500) NOT NULL DEFAULT '',
      journal_entry_id VARCHAR(24) REFERENCES journal_entries(id) ON DELETE SET NULL,
      created_by_id VARCHAR(24) REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX expenses_category_idx ON expenses (category_id);
    CREATE INDEX expenses_store_idx ON expenses (store_id);
    CREATE INDEX expenses_date_idx ON expenses (date);
    CREATE INDEX expenses_status_idx ON expenses (status);

    -- ============================================================
    -- Day end
    -- ============================================================
    CREATE TABLE day_ends (
      id VARCHAR(24) PRIMARY KEY,
      store_id VARCHAR(24) NOT NULL REFERENCES stores(id) ON DELETE RESTRICT,
      date DATE NOT NULL,
      closed_by_id VARCHAR(24) NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      closed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      reopened_by_id VARCHAR(24) REFERENCES users(id) ON DELETE SET NULL,
      reopened_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (store_id, date)
    );

    -- ============================================================
    -- Forward-reference FKs (gate_passes now exists)
    -- ============================================================
    ALTER TABLE sales
      ADD CONSTRAINT sales_gate_pass_fk FOREIGN KEY (gate_pass_id) REFERENCES gate_passes(id) ON DELETE SET NULL,
      ADD CONSTRAINT sales_vendor_gate_pass_fk FOREIGN KEY (vendor_gate_pass_id) REFERENCES gate_passes(id) ON DELETE SET NULL;

    ALTER TABLE stock_receipts
      ADD CONSTRAINT stock_receipts_gate_pass_fk FOREIGN KEY (gate_pass_id) REFERENCES gate_passes(id) ON DELETE SET NULL;
  `,
    { transaction },
  );
}

module.exports = { name: '001-initial-schema', up };
