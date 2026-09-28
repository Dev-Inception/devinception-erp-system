/**
 * Vendors, Suppliers, Transporters, and Labour were the last resources with
 * no `store_id` at all — fully global/shared across every tenant, unlike
 * Customers/Catalog/Warehouses/etc. which already went through this same
 * treatment (see 004-catalog-store-scope.js). A store admin could list,
 * edit, or delete another customer's vendor/supplier/transporter/labour
 * records, and their ledger balances aggregated across tenants.
 *
 * Unlike 004 (which kept `store_id` nullable to preserve existing global
 * rows), this migration truncates first and adds `store_id NOT NULL` —
 * confirmed safe because the only data in these four tables (and everything
 * that transitively references them via ON DELETE RESTRICT: sale_items,
 * sale_labour, stock_receipts, stock_receipt_labour, pending_entities, and
 * their own downstream tables) is test/seed data. This resets every
 * tenant's transactional/financial history to day zero while leaving store
 * setup, catalog, staff accounts, and customers untouched.
 */
async function up(db, transaction) {
  await db.query(
    `
    TRUNCATE journal_lines, journal_entries, pending_entities, gate_pass_items,
      sale_warehouse_gate_passes, return_warehouse_gate_passes, gate_passes,
      stock_receipt_labour, stock_receipt_items, stock_receipts, sale_labour,
      sale_items, sale_return_items, sale_returns, sale_drafts, sales,
      estimate_follow_ups, estimate_items, estimates, expenses, day_ends,
      stock_movements, stock_levels, vendors, suppliers, transporters, labour
      CASCADE;
    TRUNCATE counters;

    ALTER TABLE vendors ADD COLUMN store_id VARCHAR(24) NOT NULL REFERENCES stores(id) ON DELETE CASCADE;
    CREATE INDEX vendors_store_idx ON vendors (store_id);

    ALTER TABLE suppliers ADD COLUMN store_id VARCHAR(24) NOT NULL REFERENCES stores(id) ON DELETE CASCADE;
    CREATE INDEX suppliers_store_idx ON suppliers (store_id);

    ALTER TABLE transporters ADD COLUMN store_id VARCHAR(24) NOT NULL REFERENCES stores(id) ON DELETE CASCADE;
    CREATE INDEX transporters_store_idx ON transporters (store_id);

    ALTER TABLE labour ADD COLUMN store_id VARCHAR(24) NOT NULL REFERENCES stores(id) ON DELETE CASCADE;
    CREATE INDEX labour_store_idx ON labour (store_id);

    DROP INDEX labour_phone_number_unique;
    CREATE UNIQUE INDEX labour_store_phone_unique ON labour (store_id, phone_number);

    UPDATE roles
    SET permissions = permissions || ARRAY['labour:read']::text[]
    WHERE name = 'cashier' AND NOT (permissions @> ARRAY['labour:read']::text[]);

    UPDATE roles
    SET permissions = permissions || ARRAY['labour:read']::text[]
    WHERE name = 'accountant' AND NOT (permissions @> ARRAY['labour:read']::text[]);

    UPDATE roles
    SET permissions = permissions || ARRAY['labour:read','labour:create','labour:update']::text[]
    WHERE name = 'manager' AND NOT (permissions @> ARRAY['labour:read']::text[]);

    UPDATE roles
    SET permissions = permissions || ARRAY['labour:read','labour:create','labour:update','labour:delete']::text[]
    WHERE name = 'admin' AND NOT (permissions @> ARRAY['labour:read']::text[]);
  `,
    { transaction },
  );
}

module.exports = { name: '010-vendor-supplier-transporter-labour-store-scope', up };
