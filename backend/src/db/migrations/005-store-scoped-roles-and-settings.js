/**
 * Two more leftovers from the single-tenant design:
 *
 *  - `settings` was a single global row — every store admin editing
 *    "Settings" (company name, address, currency, invoice note) overwrote
 *    the exact same row every other tenant's receipts/invoices read from.
 *    It now supports one row per store (nullable `store_id`; the original
 *    `key = 'app'` row is kept as the legacy/super-admin default — a new
 *    per-store row reuses that same `key` uniqueness by setting `key` to
 *    the store's own id, which is already guaranteed unique).
 *
 *  - `roles` gets the same treatment as categories/brands/units: a store
 *    admin can now create their own custom roles (visible only to them),
 *    tagged with `store_id`. The 5 built-in roles stay global (`store_id`
 *    NULL, `is_system` true) and their *names* stay globally unique — only
 *    a custom role's *visibility* is store-scoped, not its name, so
 *    `users.role`'s existing name-based reference to `roles.name` doesn't
 *    need to change.
 *
 * The `admin` role also gains role-management permissions here (existing
 * rows aren't touched by ensureSystemRoles' idempotent seed, so this is
 * applied directly) — a store admin manages their *own* custom roles the
 * same way they already manage their own staff.
 */
async function up(db, transaction) {
  await db.query(
    `
    ALTER TABLE settings ADD COLUMN store_id VARCHAR(24) REFERENCES stores(id) ON DELETE CASCADE;
    CREATE INDEX settings_store_idx ON settings (store_id);

    ALTER TABLE roles ADD COLUMN store_id VARCHAR(24) REFERENCES stores(id) ON DELETE CASCADE;
    CREATE INDEX roles_store_idx ON roles (store_id);

    UPDATE roles
    SET permissions = permissions || ARRAY['roles:read','roles:create','roles:update','roles:delete']::text[]
    WHERE name = 'admin' AND NOT (permissions @> ARRAY['roles:read']::text[]);
  `,
    { transaction },
  );
}

module.exports = { name: '005-store-scoped-roles-and-settings', up };
