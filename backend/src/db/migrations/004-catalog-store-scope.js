/**
 * Categories, brands and units were global/shared catalog data — a leftover
 * from the single-tenant design, before stores represented separate
 * customer businesses. Each now belongs to one store (nullable: existing
 * rows predate multi-tenancy and stay "legacy", visible only to an
 * unrestricted actor — see utils/storeScope.js — exactly like a null-store
 * journal entry or gate pass already behaves elsewhere in this schema).
 * A brand-new store starts with none of its own, matching every other
 * per-store entity.
 *
 * The old global `LOWER(name)` uniqueness would otherwise block two
 * different stores from both having, say, an "Electronics" category — it's
 * replaced with a per-store equivalent.
 */
async function up(db, transaction) {
  await db.query(
    `
    ALTER TABLE categories ADD COLUMN store_id VARCHAR(24) REFERENCES stores(id) ON DELETE CASCADE;
    ALTER TABLE brands ADD COLUMN store_id VARCHAR(24) REFERENCES stores(id) ON DELETE CASCADE;
    ALTER TABLE units ADD COLUMN store_id VARCHAR(24) REFERENCES stores(id) ON DELETE CASCADE;

    DROP INDEX categories_name_ci_unique;
    DROP INDEX brands_name_ci_unique;
    DROP INDEX units_name_ci_unique;

    CREATE UNIQUE INDEX categories_store_name_ci_unique ON categories (store_id, LOWER(name));
    CREATE UNIQUE INDEX brands_store_name_ci_unique ON brands (store_id, LOWER(name));
    CREATE UNIQUE INDEX units_store_name_ci_unique ON units (store_id, LOWER(name));

    CREATE INDEX categories_store_idx ON categories (store_id);
    CREATE INDEX brands_store_idx ON brands (store_id);
    CREATE INDEX units_store_idx ON units (store_id);
  `,
    { transaction },
  );
}

module.exports = { name: '004-catalog-store-scope', up };
