const name = '005-main-backend-schema';

async function up(db, transaction) {
  await db.query(
    `
    CREATE TABLE stores (
      id VARCHAR(24) PRIMARY KEY, name VARCHAR(120) NOT NULL, code VARCHAR(20) NOT NULL DEFAULT '',
      address VARCHAR(300) NOT NULL DEFAULT '', is_default BOOLEAN NOT NULL DEFAULT FALSE,
      is_active BOOLEAN NOT NULL DEFAULT TRUE, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE UNIQUE INDEX stores_single_default ON stores (is_default) WHERE is_default;
    CREATE UNIQUE INDEX stores_code_ci_unique ON stores (LOWER(code)) WHERE code <> '';
    INSERT INTO stores (id, name, code, is_default) VALUES (SUBSTR(MD5(RANDOM()::TEXT || CLOCK_TIMESTAMP()::TEXT),1,24),'Main Store','MAIN',TRUE);
    CREATE TABLE store_warehouses (
      store_id VARCHAR(24) REFERENCES stores(id) ON DELETE CASCADE,
      warehouse_id VARCHAR(24) REFERENCES warehouses(id) ON DELETE CASCADE,
      PRIMARY KEY (store_id, warehouse_id)
    );
    INSERT INTO store_warehouses SELECT s.id,w.id FROM stores s CROSS JOIN warehouses w WHERE s.is_default;

    ALTER TABLE users ADD COLUMN store_id VARCHAR(24) REFERENCES stores(id) ON DELETE SET NULL, ADD COLUMN token_version INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE customers ADD COLUMN store_id VARCHAR(24) REFERENCES stores(id) ON DELETE SET NULL;
    ALTER TABLE bank_accounts ADD COLUMN store_id VARCHAR(24) REFERENCES stores(id) ON DELETE SET NULL;
    UPDATE users SET store_id=(SELECT id FROM stores WHERE is_default LIMIT 1);
    UPDATE customers SET store_id=(SELECT id FROM stores WHERE is_default LIMIT 1);
    UPDATE bank_accounts SET store_id=(SELECT id FROM stores WHERE is_default LIMIT 1);

    CREATE TABLE suppliers (
      id VARCHAR(24) PRIMARY KEY, name VARCHAR(120) NOT NULL, phone VARCHAR(30) NOT NULL DEFAULT '', email VARCHAR(120) NOT NULL DEFAULT '',
      ntn VARCHAR(40) NOT NULL DEFAULT '', address VARCHAR(300) NOT NULL DEFAULT '', outstanding BIGINT NOT NULL DEFAULT 0 CHECK(outstanding>=0),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE transporters (
      id VARCHAR(24) PRIMARY KEY, name VARCHAR(120) NOT NULL, phone VARCHAR(30) NOT NULL DEFAULT '', vehicle_number VARCHAR(40) NOT NULL DEFAULT '',
      address VARCHAR(300) NOT NULL DEFAULT '', outstanding BIGINT NOT NULL DEFAULT 0 CHECK(outstanding>=0),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    ALTER TABLE sales ADD COLUMN store_id VARCHAR(24) REFERENCES stores(id) ON DELETE RESTRICT,
      ADD COLUMN transport JSONB NOT NULL DEFAULT '{}', ADD COLUMN transporter_id VARCHAR(24) REFERENCES transporters(id) ON DELETE SET NULL,
      ADD COLUMN transport_fare_method VARCHAR(30), ADD COLUMN transport_fare_bank_account_id VARCHAR(24) REFERENCES bank_accounts(id) ON DELETE SET NULL,
      ADD COLUMN transport_fare BIGINT NOT NULL DEFAULT 0 CHECK(transport_fare>=0), ADD COLUMN labour_rent BIGINT NOT NULL DEFAULT 0 CHECK(labour_rent>=0),
      ADD COLUMN additional_paid_amount BIGINT NOT NULL DEFAULT 0 CHECK(additional_paid_amount>=0), ADD COLUMN returned_total BIGINT NOT NULL DEFAULT 0 CHECK(returned_total>=0),
      ADD COLUMN last_edited_at TIMESTAMPTZ, ADD COLUMN last_edited_by_id VARCHAR(24) REFERENCES users(id) ON DELETE SET NULL,
      ADD COLUMN vendor_gate_pass_id VARCHAR(24);
    UPDATE sales SET store_id=(SELECT id FROM stores WHERE is_default LIMIT 1);
    ALTER TABLE sales ALTER COLUMN store_id SET NOT NULL;
    ALTER TABLE sale_items ADD COLUMN source VARCHAR(12) NOT NULL DEFAULT 'WAREHOUSE', ADD COLUMN warehouse_id VARCHAR(24) REFERENCES warehouses(id) ON DELETE SET NULL,
      ADD COLUMN vendor_id VARCHAR(24) REFERENCES vendors(id) ON DELETE SET NULL, ADD COLUMN vendor_name VARCHAR(120) NOT NULL DEFAULT '';
    UPDATE sale_items i SET warehouse_id=s.warehouse_id FROM sales s WHERE s.id=i.sale_id;
    ALTER TABLE sale_labour ADD COLUMN rent BIGINT NOT NULL DEFAULT 0 CHECK(rent>=0);
    ALTER TABLE journal_entries ADD COLUMN store_id VARCHAR(24) REFERENCES stores(id) ON DELETE SET NULL;
    ALTER TABLE settings ADD COLUMN invoice_note TEXT NOT NULL DEFAULT '';

    CREATE TABLE sale_drafts (
      id VARCHAR(24) PRIMARY KEY, created_by_id VARCHAR(24) NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
      store_id VARCHAR(24) REFERENCES stores(id) ON DELETE SET NULL, step INTEGER NOT NULL DEFAULT 1,
      customer JSONB NOT NULL DEFAULT '{}', items JSONB NOT NULL DEFAULT '[]', labour JSONB NOT NULL DEFAULT '[]', driver JSONB NOT NULL DEFAULT '{}',
      transport_fare BIGINT NOT NULL DEFAULT 0, discount_value BIGINT NOT NULL DEFAULT 0, discount_type VARCHAR(10) NOT NULL DEFAULT 'amount',
      tax_pct NUMERIC(9,4) NOT NULL DEFAULT 0, advance_amount BIGINT NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE sale_returns (
      id VARCHAR(24) PRIMARY KEY, number VARCHAR(100) NOT NULL UNIQUE, sale_id VARCHAR(24) NOT NULL REFERENCES sales(id) ON DELETE RESTRICT,
      sale_number VARCHAR(100) NOT NULL, customer_id VARCHAR(24) REFERENCES customers(id) ON DELETE SET NULL, customer_name VARCHAR(120) NOT NULL DEFAULT '',
      date TIMESTAMPTZ NOT NULL DEFAULT NOW(), subtotal BIGINT NOT NULL CHECK(subtotal>=0), discount BIGINT NOT NULL DEFAULT 0 CHECK(discount>=0),
      tax BIGINT NOT NULL DEFAULT 0 CHECK(tax>=0), total BIGINT NOT NULL CHECK(total>=0), cost BIGINT NOT NULL DEFAULT 0 CHECK(cost>=0),
      note VARCHAR(500) NOT NULL DEFAULT '', created_by_id VARCHAR(24) REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE sale_return_items (
      id BIGSERIAL PRIMARY KEY, sale_return_id VARCHAR(24) NOT NULL REFERENCES sale_returns(id) ON DELETE CASCADE, position INTEGER NOT NULL,
      product_id VARCHAR(24) NOT NULL REFERENCES products(id) ON DELETE RESTRICT, name VARCHAR(160) NOT NULL,
      quantity NUMERIC(20,6) NOT NULL CHECK(quantity>=0), unit_price BIGINT NOT NULL CHECK(unit_price>=0), line_total BIGINT NOT NULL CHECK(line_total>=0),
      cost BIGINT NOT NULL DEFAULT 0 CHECK(cost>=0), source VARCHAR(12) NOT NULL DEFAULT 'WAREHOUSE', warehouse_id VARCHAR(24) REFERENCES warehouses(id) ON DELETE SET NULL,
      UNIQUE(sale_return_id,position)
    );

    CREATE TABLE stock_receipts (
      id VARCHAR(24) PRIMARY KEY, number VARCHAR(100) NOT NULL UNIQUE, supplier_id VARCHAR(24) NOT NULL REFERENCES suppliers(id) ON DELETE RESTRICT,
      supplier_name VARCHAR(120) NOT NULL DEFAULT '', store_id VARCHAR(24) NOT NULL REFERENCES stores(id) ON DELETE RESTRICT,
      warehouse_id VARCHAR(24) NOT NULL REFERENCES warehouses(id) ON DELETE RESTRICT, date TIMESTAMPTZ NOT NULL DEFAULT NOW(), is_opening_stock BOOLEAN NOT NULL DEFAULT FALSE,
      truck JSONB NOT NULL DEFAULT '{}', transporter_id VARCHAR(24) REFERENCES transporters(id) ON DELETE SET NULL, truck_fare BIGINT NOT NULL DEFAULT 0,
      truck_fare_paid_by VARCHAR(12) NOT NULL DEFAULT 'SUPPLIER', truck_fare_method VARCHAR(30), truck_fare_bank_account_id VARCHAR(24) REFERENCES bank_accounts(id) ON DELETE SET NULL,
      labour_rent BIGINT NOT NULL DEFAULT 0, note VARCHAR(500) NOT NULL DEFAULT '', additional_paid_amount BIGINT NOT NULL DEFAULT 0,
      created_by_id VARCHAR(24) REFERENCES users(id) ON DELETE SET NULL, gate_pass_id VARCHAR(24),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE stock_receipt_items (
      id BIGSERIAL PRIMARY KEY, stock_receipt_id VARCHAR(24) NOT NULL REFERENCES stock_receipts(id) ON DELETE CASCADE, position INTEGER NOT NULL,
      product_id VARCHAR(24) NOT NULL REFERENCES products(id) ON DELETE RESTRICT, name VARCHAR(160) NOT NULL,
      received_quantity NUMERIC(20,6) NOT NULL DEFAULT 0, damaged_quantity NUMERIC(20,6) NOT NULL DEFAULT 0, UNIQUE(stock_receipt_id,position)
    );
    CREATE TABLE stock_receipt_labour (
      id BIGSERIAL PRIMARY KEY, stock_receipt_id VARCHAR(24) NOT NULL REFERENCES stock_receipts(id) ON DELETE CASCADE, position INTEGER NOT NULL,
      labour_id VARCHAR(24) NOT NULL REFERENCES labour(id) ON DELETE RESTRICT, name VARCHAR(100) NOT NULL, phone_number VARCHAR(30) NOT NULL DEFAULT '',
      rent BIGINT NOT NULL DEFAULT 0, UNIQUE(stock_receipt_id,position)
    );

    CREATE TABLE estimates (
      id VARCHAR(24) PRIMARY KEY, number VARCHAR(100) NOT NULL UNIQUE, customer_id VARCHAR(24) REFERENCES customers(id) ON DELETE SET NULL,
      customer_name VARCHAR(120) NOT NULL, customer_phone VARCHAR(40) NOT NULL DEFAULT '', customer_address VARCHAR(240) NOT NULL DEFAULT '',
      store_id VARCHAR(24) NOT NULL REFERENCES stores(id) ON DELETE RESTRICT, date TIMESTAMPTZ NOT NULL DEFAULT NOW(), subtotal BIGINT NOT NULL,
      discount BIGINT NOT NULL DEFAULT 0, tax_percent NUMERIC(9,4) NOT NULL DEFAULT 0, tax BIGINT NOT NULL DEFAULT 0, total BIGINT NOT NULL,
      notes TEXT NOT NULL DEFAULT '', status VARCHAR(16) NOT NULL DEFAULT 'PENDING', next_follow_up_date TIMESTAMPTZ, lost_reason VARCHAR(500) NOT NULL DEFAULT '',
      converted_sale_id VARCHAR(24) REFERENCES sales(id) ON DELETE SET NULL, converted_at TIMESTAMPTZ, created_by_id VARCHAR(24) REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE estimate_items (
      id BIGSERIAL PRIMARY KEY, estimate_id VARCHAR(24) NOT NULL REFERENCES estimates(id) ON DELETE CASCADE, position INTEGER NOT NULL,
      product_id VARCHAR(24) NOT NULL REFERENCES products(id) ON DELETE RESTRICT, name VARCHAR(160) NOT NULL,
      quantity NUMERIC(20,6) NOT NULL, unit_price BIGINT NOT NULL, line_total BIGINT NOT NULL, UNIQUE(estimate_id,position)
    );
    CREATE TABLE estimate_followups (
      id BIGSERIAL PRIMARY KEY, estimate_id VARCHAR(24) NOT NULL REFERENCES estimates(id) ON DELETE CASCADE, position INTEGER NOT NULL,
      date TIMESTAMPTZ NOT NULL DEFAULT NOW(), note VARCHAR(500) NOT NULL, by_id VARCHAR(24) REFERENCES users(id) ON DELETE SET NULL,
      UNIQUE(estimate_id,position)
    );

    CREATE TABLE expense_categories (
      id VARCHAR(24) PRIMARY KEY, name VARCHAR(80) NOT NULL, description VARCHAR(500) NOT NULL DEFAULT '', is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE UNIQUE INDEX expense_categories_name_ci_unique ON expense_categories(LOWER(name));
    CREATE TABLE expenses (
      id VARCHAR(24) PRIMARY KEY, number VARCHAR(100) NOT NULL UNIQUE, category_id VARCHAR(24) NOT NULL REFERENCES expense_categories(id) ON DELETE RESTRICT,
      category_name VARCHAR(80) NOT NULL, amount BIGINT NOT NULL CHECK(amount>=0), method VARCHAR(30) NOT NULL,
      bank_account_id VARCHAR(24) REFERENCES bank_accounts(id) ON DELETE SET NULL, store_id VARCHAR(24) NOT NULL REFERENCES stores(id) ON DELETE RESTRICT,
      warehouse_id VARCHAR(24) REFERENCES warehouses(id) ON DELETE SET NULL, date TIMESTAMPTZ NOT NULL DEFAULT NOW(), note VARCHAR(500) NOT NULL DEFAULT '',
      status VARCHAR(12) NOT NULL DEFAULT 'PENDING', approved_by_id VARCHAR(24) REFERENCES users(id) ON DELETE SET NULL, approved_at TIMESTAMPTZ,
      rejected_by_id VARCHAR(24) REFERENCES users(id) ON DELETE SET NULL, rejected_at TIMESTAMPTZ, rejection_reason VARCHAR(500) NOT NULL DEFAULT '',
      journal_entry_id VARCHAR(24) REFERENCES journal_entries(id) ON DELETE SET NULL, created_by_id VARCHAR(24) REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE pending_entities (
      id VARCHAR(24) PRIMARY KEY, source_type VARCHAR(24) NOT NULL, sale_id VARCHAR(24) REFERENCES sales(id) ON DELETE CASCADE,
      stock_receipt_id VARCHAR(24) REFERENCES stock_receipts(id) ON DELETE CASCADE, source_no VARCHAR(100) NOT NULL DEFAULT '',
      vendor_id VARCHAR(24) REFERENCES vendors(id) ON DELETE SET NULL, vendor_name VARCHAR(120) NOT NULL DEFAULT '',
      supplier_id VARCHAR(24) REFERENCES suppliers(id) ON DELETE SET NULL, supplier_name VARCHAR(120) NOT NULL DEFAULT '',
      product_id VARCHAR(24) NOT NULL REFERENCES products(id) ON DELETE RESTRICT, product_name VARCHAR(160) NOT NULL DEFAULT '', quantity NUMERIC(20,6) NOT NULL,
      store_id VARCHAR(24) REFERENCES stores(id) ON DELETE SET NULL, warehouse_id VARCHAR(24) REFERENCES warehouses(id) ON DELETE SET NULL,
      date TIMESTAMPTZ NOT NULL DEFAULT NOW(), status VARCHAR(12) NOT NULL DEFAULT 'PENDING', purchase_price BIGINT, line_total BIGINT,
      priced_by_id VARCHAR(24) REFERENCES users(id) ON DELETE SET NULL, priced_at TIMESTAMPTZ, created_by_id VARCHAR(24) REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE day_ends (
      id VARCHAR(24) PRIMARY KEY, store_id VARCHAR(24) NOT NULL REFERENCES stores(id) ON DELETE CASCADE, date DATE NOT NULL,
      closed_by_id VARCHAR(24) NOT NULL REFERENCES users(id) ON DELETE RESTRICT, closed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      reopened_by_id VARCHAR(24) REFERENCES users(id) ON DELETE SET NULL, reopened_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), UNIQUE(store_id,date)
    );

    ALTER TABLE gate_passes DROP CONSTRAINT IF EXISTS gate_passes_check, DROP CONSTRAINT IF EXISTS gate_passes_source_type_check,
      DROP CONSTRAINT IF EXISTS gate_passes_sale_id_key, DROP CONSTRAINT IF EXISTS gate_passes_purchase_id_key;
    ALTER TABLE gate_passes ALTER COLUMN source_type TYPE VARCHAR(20),
      ADD COLUMN sale_return_id VARCHAR(24) REFERENCES sale_returns(id) ON DELETE RESTRICT,
      ADD COLUMN stock_receipt_id VARCHAR(24) REFERENCES stock_receipts(id) ON DELETE RESTRICT,
      ADD COLUMN kind VARCHAR(12) NOT NULL DEFAULT 'CUSTOMER', ADD COLUMN party_name VARCHAR(120) NOT NULL DEFAULT '',
      ADD COLUMN store_id VARCHAR(24) REFERENCES stores(id) ON DELETE SET NULL;
    ALTER TABLE gate_passes ADD CONSTRAINT gate_passes_source_type_check CHECK(source_type IN('SALE','RETURN','PURCHASE'));
    CREATE UNIQUE INDEX gate_passes_sale_kind_warehouse_unique ON gate_passes(sale_id,kind,warehouse_id) WHERE sale_id IS NOT NULL AND sale_return_id IS NULL;
    CREATE UNIQUE INDEX gate_passes_return_warehouse_unique ON gate_passes(sale_return_id,warehouse_id) WHERE sale_return_id IS NOT NULL;
    CREATE UNIQUE INDEX gate_passes_receipt_unique ON gate_passes(stock_receipt_id) WHERE stock_receipt_id IS NOT NULL;
    CREATE TABLE sale_warehouse_gate_passes (
      sale_id VARCHAR(24) REFERENCES sales(id) ON DELETE CASCADE, warehouse_id VARCHAR(24) REFERENCES warehouses(id) ON DELETE RESTRICT,
      gate_pass_id VARCHAR(24) NOT NULL UNIQUE REFERENCES gate_passes(id) ON DELETE CASCADE, PRIMARY KEY(sale_id,warehouse_id)
    );
    CREATE TABLE sale_return_gate_passes (
      sale_return_id VARCHAR(24) REFERENCES sale_returns(id) ON DELETE CASCADE, warehouse_id VARCHAR(24) REFERENCES warehouses(id) ON DELETE RESTRICT,
      gate_pass_id VARCHAR(24) NOT NULL UNIQUE REFERENCES gate_passes(id) ON DELETE CASCADE, PRIMARY KEY(sale_return_id,warehouse_id)
    );
    ALTER TABLE sales ADD CONSTRAINT sales_vendor_gate_pass_fk FOREIGN KEY(vendor_gate_pass_id) REFERENCES gate_passes(id) ON DELETE SET NULL;
    ALTER TABLE stock_receipts ADD CONSTRAINT stock_receipts_gate_pass_fk FOREIGN KEY(gate_pass_id) REFERENCES gate_passes(id) ON DELETE SET NULL;

    ALTER TABLE products ALTER COLUMN min_stock TYPE NUMERIC(20,6) USING min_stock::NUMERIC;
    ALTER TABLE stock_levels ALTER COLUMN quantity TYPE NUMERIC(20,6) USING quantity::NUMERIC;
    ALTER TABLE stock_movements ALTER COLUMN quantity TYPE NUMERIC(20,6) USING quantity::NUMERIC;
    ALTER TABLE sale_items ALTER COLUMN quantity TYPE NUMERIC(20,6) USING quantity::NUMERIC;
    ALTER TABLE goods_purchase_items ALTER COLUMN quantity TYPE NUMERIC(20,6) USING quantity::NUMERIC;
    ALTER TABLE invoice_items ALTER COLUMN quantity TYPE NUMERIC(20,6) USING quantity::NUMERIC;
    ALTER TABLE gate_pass_items ALTER COLUMN quantity TYPE NUMERIC(20,6) USING quantity::NUMERIC,
      ALTER COLUMN loaded_quantity TYPE NUMERIC(20,6) USING loaded_quantity::NUMERIC;
    `,
    { transaction },
  );
}

module.exports = { name, up };
