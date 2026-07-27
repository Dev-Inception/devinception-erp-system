const name = '001-initial-schema';

async function up(db, transaction) {
  await db.query(
    `
    CREATE TABLE roles (
      id VARCHAR(24) PRIMARY KEY,
      name VARCHAR(80) NOT NULL UNIQUE,
      description VARCHAR(200) NOT NULL DEFAULT '',
      permissions TEXT[] NOT NULL DEFAULT '{}',
      is_system BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE UNIQUE INDEX roles_name_ci_unique ON roles (LOWER(name));

    CREATE TABLE users (
      id VARCHAR(24) PRIMARY KEY,
      name VARCHAR(80) NOT NULL,
      email VARCHAR(255) NOT NULL,
      password VARCHAR(255) NOT NULL,
      role VARCHAR(80) NOT NULL DEFAULT 'cashier',
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      password_reset_token VARCHAR(255),
      password_reset_expires TIMESTAMPTZ,
      password_changed_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT users_role_fk FOREIGN KEY (role) REFERENCES roles(name)
        ON UPDATE CASCADE ON DELETE RESTRICT
    );
    CREATE UNIQUE INDEX users_email_ci_unique ON users (LOWER(email));
    CREATE INDEX users_role_idx ON users (role);

    CREATE TABLE warehouses (
      id VARCHAR(24) PRIMARY KEY,
      name VARCHAR(120) NOT NULL,
      location VARCHAR(120) NOT NULL DEFAULT '',
      address VARCHAR(300) NOT NULL DEFAULT '',
      is_default BOOLEAN NOT NULL DEFAULT FALSE,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE UNIQUE INDEX warehouses_single_default
      ON warehouses (is_default) WHERE is_default = TRUE;
    CREATE INDEX warehouses_name_idx ON warehouses (name);

    CREATE TABLE categories (
      id VARCHAR(24) PRIMARY KEY,
      name VARCHAR(80) NOT NULL,
      description VARCHAR(500) NOT NULL DEFAULT '',
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE UNIQUE INDEX categories_name_ci_unique ON categories (LOWER(name));

    CREATE TABLE brands (
      id VARCHAR(24) PRIMARY KEY,
      name VARCHAR(80) NOT NULL,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE UNIQUE INDEX brands_name_ci_unique ON brands (LOWER(name));

    CREATE TABLE units (
      id VARCHAR(24) PRIMARY KEY,
      name VARCHAR(40) NOT NULL,
      abbreviation VARCHAR(20) NOT NULL DEFAULT '',
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE UNIQUE INDEX units_name_ci_unique ON units (LOWER(name));

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
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE UNIQUE INDEX products_sku_unique ON products (sku) WHERE sku <> '';
    CREATE INDEX products_name_idx ON products (name);
    CREATE INDEX products_warehouse_idx ON products (warehouse_id);

    CREATE TABLE customers (
      id VARCHAR(24) PRIMARY KEY,
      name VARCHAR(120) NOT NULL,
      phone VARCHAR(30) NOT NULL DEFAULT '',
      email VARCHAR(120) NOT NULL DEFAULT '',
      address VARCHAR(300) NOT NULL DEFAULT '',
      credit_limit BIGINT NOT NULL DEFAULT 0 CHECK (credit_limit >= 0),
      outstanding BIGINT NOT NULL DEFAULT 0 CHECK (outstanding >= 0),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX customers_name_idx ON customers (name);

    CREATE TABLE vendors (
      id VARCHAR(24) PRIMARY KEY,
      name VARCHAR(120) NOT NULL,
      phone VARCHAR(30) NOT NULL DEFAULT '',
      email VARCHAR(120) NOT NULL DEFAULT '',
      ntn VARCHAR(40) NOT NULL DEFAULT '',
      address VARCHAR(300) NOT NULL DEFAULT '',
      outstanding BIGINT NOT NULL DEFAULT 0 CHECK (outstanding >= 0),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX vendors_name_idx ON vendors (name);

    CREATE TABLE bank_accounts (
      id VARCHAR(24) PRIMARY KEY,
      name VARCHAR(120) NOT NULL,
      bank_name VARCHAR(120) NOT NULL DEFAULT '',
      account_number VARCHAR(60) NOT NULL DEFAULT '',
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX bank_accounts_name_idx ON bank_accounts (name);

    CREATE TABLE labour (
      id VARCHAR(24) PRIMARY KEY,
      name VARCHAR(100) NOT NULL,
      phone_number VARCHAR(15) NOT NULL UNIQUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE stock_levels (
      id VARCHAR(24) PRIMARY KEY,
      product_id VARCHAR(24) NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      warehouse_id VARCHAR(24) NOT NULL REFERENCES warehouses(id) ON DELETE CASCADE,
      quantity NUMERIC(20,6) NOT NULL DEFAULT 0,
      avg_cost NUMERIC(30,12) NOT NULL DEFAULT 0 CHECK (avg_cost >= 0),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (product_id, warehouse_id)
    );

    CREATE TABLE stock_movements (
      id VARCHAR(24) PRIMARY KEY,
      product_id VARCHAR(24) NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
      warehouse_id VARCHAR(24) NOT NULL REFERENCES warehouses(id) ON DELETE RESTRICT,
      type VARCHAR(10) NOT NULL CHECK (type IN ('IN', 'OUT', 'ADJUST')),
      quantity NUMERIC(20,6) NOT NULL,
      unit_cost NUMERIC(30,12) NOT NULL DEFAULT 0 CHECK (unit_cost >= 0),
      total_cost BIGINT CHECK (total_cost >= 0),
      ref_type VARCHAR(30) NOT NULL DEFAULT '',
      ref_no VARCHAR(100) NOT NULL DEFAULT '',
      date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX stock_movements_product_idx ON stock_movements (product_id);
    CREATE INDEX stock_movements_warehouse_date_idx ON stock_movements (warehouse_id, date);

    CREATE TABLE sales (
      id VARCHAR(24) PRIMARY KEY,
      number VARCHAR(100) NOT NULL UNIQUE,
      customer_id VARCHAR(24) REFERENCES customers(id) ON DELETE SET NULL,
      customer_name VARCHAR(120) NOT NULL DEFAULT 'Walk-in',
      warehouse_id VARCHAR(24) NOT NULL REFERENCES warehouses(id) ON DELETE RESTRICT,
      date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      subtotal BIGINT NOT NULL CHECK (subtotal >= 0),
      discount BIGINT NOT NULL DEFAULT 0 CHECK (discount >= 0),
      tax_percent NUMERIC(9,4) NOT NULL DEFAULT 0 CHECK (tax_percent >= 0),
      tax BIGINT NOT NULL DEFAULT 0 CHECK (tax >= 0),
      total BIGINT NOT NULL CHECK (total >= 0),
      cost BIGINT NOT NULL DEFAULT 0 CHECK (cost >= 0),
      payment_method VARCHAR(30) NOT NULL,
      cash_amount BIGINT NOT NULL DEFAULT 0 CHECK (cash_amount >= 0),
      online_amount BIGINT NOT NULL DEFAULT 0 CHECK (online_amount >= 0),
      credit_amount BIGINT NOT NULL DEFAULT 0 CHECK (credit_amount >= 0),
      bank_account_id VARCHAR(24) REFERENCES bank_accounts(id) ON DELETE SET NULL,
      transfer_receipt_ref TEXT NOT NULL DEFAULT '',
      created_by_id VARCHAR(24) REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX sales_customer_idx ON sales (customer_id);
    CREATE INDEX sales_warehouse_date_idx ON sales (warehouse_id, date);

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
      UNIQUE (sale_id, position)
    );

    CREATE TABLE sale_labour (
      id BIGSERIAL PRIMARY KEY,
      sale_id VARCHAR(24) NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
      position INTEGER NOT NULL,
      labour_id VARCHAR(24) NOT NULL REFERENCES labour(id) ON DELETE RESTRICT,
      name VARCHAR(100) NOT NULL,
      phone_number VARCHAR(30) NOT NULL DEFAULT '',
      UNIQUE (sale_id, position)
    );

    CREATE TABLE goods_purchases (
      id VARCHAR(24) PRIMARY KEY,
      number VARCHAR(100) NOT NULL UNIQUE,
      vendor_invoice_no VARCHAR(100) NOT NULL DEFAULT '',
      vendor_id VARCHAR(24) NOT NULL REFERENCES vendors(id) ON DELETE RESTRICT,
      vendor_name VARCHAR(120) NOT NULL DEFAULT '',
      warehouse_id VARCHAR(24) NOT NULL REFERENCES warehouses(id) ON DELETE RESTRICT,
      date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      subtotal BIGINT NOT NULL DEFAULT 0 CHECK (subtotal >= 0),
      discount BIGINT NOT NULL DEFAULT 0 CHECK (discount >= 0),
      tax BIGINT NOT NULL DEFAULT 0 CHECK (tax >= 0),
      total BIGINT NOT NULL CHECK (total >= 0),
      paid BIGINT NOT NULL DEFAULT 0 CHECK (paid >= 0),
      balance BIGINT NOT NULL DEFAULT 0,
      payment_method VARCHAR(30),
      bank_account_id VARCHAR(24) REFERENCES bank_accounts(id) ON DELETE SET NULL,
      notes TEXT NOT NULL DEFAULT '',
      created_by_id VARCHAR(24) REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX goods_purchases_vendor_idx ON goods_purchases (vendor_id);
    CREATE INDEX goods_purchases_warehouse_date_idx ON goods_purchases (warehouse_id, date);

    CREATE TABLE goods_purchase_items (
      id BIGSERIAL PRIMARY KEY,
      purchase_id VARCHAR(24) NOT NULL REFERENCES goods_purchases(id) ON DELETE CASCADE,
      position INTEGER NOT NULL,
      product_id VARCHAR(24) NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
      name VARCHAR(160) NOT NULL,
      quantity NUMERIC(20,6) NOT NULL CHECK (quantity >= 0),
      unit_cost BIGINT NOT NULL CHECK (unit_cost >= 0),
      tax_percent NUMERIC(9,4) NOT NULL DEFAULT 0 CHECK (tax_percent >= 0),
      tax BIGINT NOT NULL DEFAULT 0 CHECK (tax >= 0),
      line_total BIGINT NOT NULL CHECK (line_total >= 0),
      UNIQUE (purchase_id, position)
    );

    CREATE TABLE invoices (
      id VARCHAR(24) PRIMARY KEY,
      type VARCHAR(20) NOT NULL DEFAULT 'PURCHASE' CHECK (type = 'PURCHASE'),
      purchase_id VARCHAR(24) NOT NULL UNIQUE REFERENCES goods_purchases(id) ON DELETE RESTRICT,
      number VARCHAR(100) NOT NULL UNIQUE,
      vendor_invoice_no VARCHAR(100) NOT NULL DEFAULT '',
      vendor_id VARCHAR(24) NOT NULL REFERENCES vendors(id) ON DELETE RESTRICT,
      vendor_name VARCHAR(120) NOT NULL DEFAULT '',
      warehouse_id VARCHAR(24) NOT NULL REFERENCES warehouses(id) ON DELETE RESTRICT,
      date TIMESTAMPTZ NOT NULL,
      subtotal BIGINT NOT NULL CHECK (subtotal >= 0),
      discount BIGINT NOT NULL DEFAULT 0 CHECK (discount >= 0),
      tax BIGINT NOT NULL DEFAULT 0 CHECK (tax >= 0),
      total BIGINT NOT NULL CHECK (total >= 0),
      paid BIGINT NOT NULL DEFAULT 0 CHECK (paid >= 0),
      balance BIGINT NOT NULL DEFAULT 0 CHECK (balance >= 0),
      status VARCHAR(10) NOT NULL DEFAULT 'UNPAID'
        CHECK (status IN ('UNPAID', 'PARTIAL', 'PAID')),
      notes TEXT NOT NULL DEFAULT '',
      created_by_id VARCHAR(24) REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX invoices_vendor_idx ON invoices (vendor_id);
    CREATE INDEX invoices_date_idx ON invoices (date);

    CREATE TABLE invoice_items (
      id BIGSERIAL PRIMARY KEY,
      invoice_id VARCHAR(24) NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
      position INTEGER NOT NULL,
      product_id VARCHAR(24) NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
      name VARCHAR(160) NOT NULL,
      quantity NUMERIC(20,6) NOT NULL CHECK (quantity >= 0),
      unit_cost BIGINT NOT NULL CHECK (unit_cost >= 0),
      tax_percent NUMERIC(9,4) NOT NULL DEFAULT 0 CHECK (tax_percent >= 0),
      tax BIGINT NOT NULL DEFAULT 0 CHECK (tax >= 0),
      line_total BIGINT NOT NULL CHECK (line_total >= 0),
      UNIQUE (invoice_id, position)
    );

    CREATE TABLE journal_entries (
      id VARCHAR(24) PRIMARY KEY,
      date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      description TEXT NOT NULL DEFAULT '',
      ref_type VARCHAR(30) NOT NULL,
      ref_id VARCHAR(24),
      ref_no VARCHAR(100) NOT NULL DEFAULT '',
      warehouse_id VARCHAR(24) REFERENCES warehouses(id) ON DELETE SET NULL,
      created_by_id VARCHAR(24) REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX journal_entries_date_idx ON journal_entries (date);
    CREATE INDEX journal_entries_ref_idx ON journal_entries (ref_type, ref_id);
    CREATE INDEX journal_entries_ref_no_idx ON journal_entries (ref_no);

    CREATE TABLE journal_lines (
      id BIGSERIAL PRIMARY KEY,
      journal_entry_id VARCHAR(24) NOT NULL REFERENCES journal_entries(id) ON DELETE CASCADE,
      position INTEGER NOT NULL,
      account VARCHAR(30) NOT NULL,
      ref_id VARCHAR(24),
      debit BIGINT NOT NULL DEFAULT 0 CHECK (debit >= 0),
      credit BIGINT NOT NULL DEFAULT 0 CHECK (credit >= 0),
      CHECK ((debit > 0 AND credit = 0) OR (credit > 0 AND debit = 0)),
      UNIQUE (journal_entry_id, position)
    );
    CREATE INDEX journal_lines_account_ref_idx ON journal_lines (account, ref_id);

    CREATE OR REPLACE FUNCTION enforce_balanced_journal_entry()
    RETURNS TRIGGER AS $$
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
    $$ LANGUAGE plpgsql;

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
      key VARCHAR(30) NOT NULL DEFAULT 'app' UNIQUE,
      company_name VARCHAR(160) NOT NULL DEFAULT '',
      address VARCHAR(300) NOT NULL DEFAULT '',
      phone VARCHAR(30) NOT NULL DEFAULT '',
      email VARCHAR(120) NOT NULL DEFAULT '',
      tax_number VARCHAR(60) NOT NULL DEFAULT '',
      currency VARCHAR(10) NOT NULL DEFAULT 'PKR',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE gate_passes (
      id VARCHAR(24) PRIMARY KEY,
      number VARCHAR(100) NOT NULL UNIQUE,
      token VARCHAR(255) NOT NULL UNIQUE,
      source_type VARCHAR(10) NOT NULL CHECK (source_type IN ('SALE', 'PURCHASE')),
      sale_id VARCHAR(24) UNIQUE REFERENCES sales(id) ON DELETE RESTRICT,
      purchase_id VARCHAR(24) UNIQUE REFERENCES goods_purchases(id) ON DELETE RESTRICT,
      document_number VARCHAR(100) NOT NULL,
      warehouse_id VARCHAR(24) NOT NULL REFERENCES warehouses(id) ON DELETE RESTRICT,
      sale_date TIMESTAMPTZ NOT NULL,
      customer_id VARCHAR(24) REFERENCES customers(id) ON DELETE SET NULL,
      customer_name VARCHAR(120),
      customer_phone VARCHAR(30) NOT NULL DEFAULT '',
      customer_email VARCHAR(120) NOT NULL DEFAULT '',
      customer_address VARCHAR(300) NOT NULL DEFAULT '',
      vendor_id VARCHAR(24) REFERENCES vendors(id) ON DELETE SET NULL,
      vendor_name VARCHAR(120),
      vendor_phone VARCHAR(30) NOT NULL DEFAULT '',
      vendor_email VARCHAR(120) NOT NULL DEFAULT '',
      vendor_address VARCHAR(300) NOT NULL DEFAULT '',
      pricing_subtotal BIGINT CHECK (pricing_subtotal >= 0),
      pricing_discount BIGINT CHECK (pricing_discount >= 0),
      pricing_tax_percent NUMERIC(9,4) CHECK (pricing_tax_percent >= 0),
      pricing_tax BIGINT CHECK (pricing_tax >= 0),
      pricing_total BIGINT CHECK (pricing_total >= 0),
      status VARCHAR(10) NOT NULL DEFAULT 'ACTIVE'
        CHECK (status IN ('ACTIVE', 'USED', 'CANCELLED')),
      scanned_at TIMESTAMPTZ,
      scanned_by_id VARCHAR(24) REFERENCES users(id) ON DELETE SET NULL,
      created_by_id VARCHAR(24) REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CHECK (
        (source_type = 'SALE' AND sale_id IS NOT NULL AND purchase_id IS NULL)
        OR
        (source_type = 'PURCHASE' AND purchase_id IS NOT NULL AND sale_id IS NULL)
      )
    );
    CREATE INDEX gate_passes_warehouse_idx ON gate_passes (warehouse_id);
    CREATE INDEX gate_passes_status_idx ON gate_passes (status);

    CREATE TABLE gate_pass_items (
      id BIGSERIAL PRIMARY KEY,
      gate_pass_id VARCHAR(24) NOT NULL REFERENCES gate_passes(id) ON DELETE CASCADE,
      position INTEGER NOT NULL,
      product_id VARCHAR(24) NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
      name VARCHAR(160) NOT NULL,
      sku VARCHAR(60) NOT NULL DEFAULT '',
      barcode VARCHAR(60) NOT NULL DEFAULT '',
      quantity NUMERIC(20,6) NOT NULL CHECK (quantity >= 0),
      unit_price BIGINT CHECK (unit_price >= 0),
      line_total BIGINT CHECK (line_total >= 0),
      UNIQUE (gate_pass_id, position)
    );

    ALTER TABLE sales
      ADD COLUMN gate_pass_id VARCHAR(24) UNIQUE REFERENCES gate_passes(id) ON DELETE SET NULL;
    ALTER TABLE goods_purchases
      ADD COLUMN gate_pass_id VARCHAR(24) UNIQUE REFERENCES gate_passes(id) ON DELETE SET NULL;
    ALTER TABLE invoices
      ADD COLUMN gate_pass_id VARCHAR(24) REFERENCES gate_passes(id) ON DELETE SET NULL;
    `,
    { transaction },
  );
}

module.exports = { name, up };
