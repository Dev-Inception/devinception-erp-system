/**
 * Damaged goods on a stock receipt (stock_receipt_items.damaged_quantity)
 * never entered warehouse stock in the first place (see
 * stockReceiptService's header comment) — but until now there was nowhere
 * to track what happens to them next. This adds a "Damaged Stock" workflow:
 * a running tally of outstanding damaged quantity per receipt line
 * (stock_receipt_items.returned_quantity), and a "Damaged Stock Return"
 * document (damaged_stock_returns / damaged_stock_return_items) — the
 * purchase-side mirror of a Sale Return — recording a batch of damaged
 * items physically handed back to the supplier, complete with its own gate
 * pass (reusing the shared gate_passes table via a new 'SUPPLIER_RETURN'
 * source type, since a damaged-stock pickup is always against exactly one
 * supplier and one warehouse, unlike a sale return's potential multi-
 * warehouse fan-out).
 *
 * Deliberately no accounting entries: since damaged quantity never became
 * Inventory or a supplier payable (Pending Entities are only ever created
 * for the received-good quantity — see pendingEntityService), a return has
 * nothing on the ledger to reverse. This is purely a physical/quantity
 * record, same as the damaged_quantity column it's built on.
 */
async function up(db, transaction) {
  await db.query(
    `
    CREATE TABLE damaged_stock_returns (
      id VARCHAR(24) PRIMARY KEY,
      number VARCHAR(40) NOT NULL UNIQUE,
      supplier_id VARCHAR(24) NOT NULL REFERENCES suppliers(id) ON DELETE RESTRICT,
      supplier_name VARCHAR(120) NOT NULL DEFAULT '',
      store_id VARCHAR(24) NOT NULL REFERENCES stores(id) ON DELETE RESTRICT,
      warehouse_id VARCHAR(24) NOT NULL REFERENCES warehouses(id) ON DELETE RESTRICT,
      date TIMESTAMPTZ NOT NULL DEFAULT now(),
      truck_vehicle_number VARCHAR(80) NOT NULL DEFAULT '',
      truck_driver_name VARCHAR(120) NOT NULL DEFAULT '',
      truck_driver_phone VARCHAR(40) NOT NULL DEFAULT '',
      note VARCHAR(500) NOT NULL DEFAULT '',
      gate_pass_id VARCHAR(24) REFERENCES gate_passes(id) ON DELETE SET NULL,
      created_by_id VARCHAR(24) REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX damaged_stock_returns_supplier_idx ON damaged_stock_returns (supplier_id);
    CREATE INDEX damaged_stock_returns_store_idx ON damaged_stock_returns (store_id);
    CREATE INDEX damaged_stock_returns_warehouse_idx ON damaged_stock_returns (warehouse_id);
    CREATE INDEX damaged_stock_returns_date_idx ON damaged_stock_returns (date);

    CREATE TABLE damaged_stock_return_items (
      id BIGSERIAL PRIMARY KEY,
      damaged_stock_return_id VARCHAR(24) NOT NULL REFERENCES damaged_stock_returns(id) ON DELETE CASCADE,
      position INTEGER NOT NULL,
      stock_receipt_item_id BIGINT REFERENCES stock_receipt_items(id) ON DELETE SET NULL,
      product_id VARCHAR(24) NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
      name VARCHAR(160) NOT NULL,
      quantity NUMERIC(20,6) NOT NULL CHECK (quantity >= 0),
      unit_cost BIGINT NOT NULL DEFAULT 0 CHECK (unit_cost >= 0),
      line_total BIGINT NOT NULL DEFAULT 0 CHECK (line_total >= 0),
      UNIQUE (damaged_stock_return_id, position)
    );

    -- How much of each line's damaged quantity has already been handed back
    -- to the supplier — caps future returns at (damaged_quantity - returned_quantity).
    ALTER TABLE stock_receipt_items
      ADD COLUMN returned_quantity NUMERIC(20,6) NOT NULL DEFAULT 0 CHECK (returned_quantity >= 0);

    ALTER TABLE gate_passes
      ADD COLUMN damaged_stock_return_id VARCHAR(24) REFERENCES damaged_stock_returns(id) ON DELETE RESTRICT;

    -- 'SUPPLIER_RETURN' (16 chars) doesn't fit the original VARCHAR(10).
    ALTER TABLE gate_passes ALTER COLUMN source_type TYPE VARCHAR(20);

    ALTER TABLE gate_passes DROP CONSTRAINT gate_passes_source_type_check;
    ALTER TABLE gate_passes ADD CONSTRAINT gate_passes_source_type_check
      CHECK (source_type IN ('SALE','RETURN','PURCHASE','SUPPLIER_RETURN'));

    ALTER TABLE gate_passes DROP CONSTRAINT gate_passes_check;
    ALTER TABLE gate_passes ADD CONSTRAINT gate_passes_check CHECK (
      (source_type = 'SALE' AND sale_id IS NOT NULL AND sale_return_id IS NULL AND stock_receipt_id IS NULL AND damaged_stock_return_id IS NULL)
      OR
      (source_type = 'RETURN' AND sale_return_id IS NOT NULL AND sale_id IS NOT NULL AND stock_receipt_id IS NULL AND damaged_stock_return_id IS NULL)
      OR
      (source_type = 'PURCHASE' AND stock_receipt_id IS NOT NULL AND sale_id IS NULL AND sale_return_id IS NULL AND damaged_stock_return_id IS NULL)
      OR
      (source_type = 'SUPPLIER_RETURN' AND damaged_stock_return_id IS NOT NULL AND sale_id IS NULL AND sale_return_id IS NULL AND stock_receipt_id IS NULL)
    );

    -- One SUPPLIER_RETURN pass per damaged stock return.
    CREATE UNIQUE INDEX gate_passes_damaged_stock_return_unique
      ON gate_passes (damaged_stock_return_id)
      WHERE damaged_stock_return_id IS NOT NULL;

    UPDATE roles
    SET permissions = permissions || ARRAY['damaged-stock:read']::text[]
    WHERE name = 'cashier' AND NOT (permissions @> ARRAY['damaged-stock:read']::text[]);

    UPDATE roles
    SET permissions = permissions || ARRAY['damaged-stock:read']::text[]
    WHERE name = 'accountant' AND NOT (permissions @> ARRAY['damaged-stock:read']::text[]);

    UPDATE roles
    SET permissions = permissions || ARRAY['damaged-stock:read','damaged-stock:manage']::text[]
    WHERE name = 'manager' AND NOT (permissions @> ARRAY['damaged-stock:read']::text[]);

    UPDATE roles
    SET permissions = permissions || ARRAY['damaged-stock:read','damaged-stock:manage']::text[]
    WHERE name = 'admin' AND NOT (permissions @> ARRAY['damaged-stock:read']::text[]);
  `,
    { transaction },
  );
}

module.exports = { name: '014-damaged-stock-returns', up };
