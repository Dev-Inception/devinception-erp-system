/**
 * Labour Services: a catalog of billable service types (Ceiling, Panel, UV
 * Sheet, Wooden floor, ...) — same shape/scoping as categories/units (store-
 * scoped, case-insensitive unique name per store) but kept as its own table
 * rather than folded into catalogService, since it isn't a product
 * classification and has its own `label` field.
 */
async function up(db, transaction) {
  await db.query(
    `
    CREATE TABLE labour_services (
      id VARCHAR(24) PRIMARY KEY,
      name VARCHAR(80) NOT NULL,
      label VARCHAR(80) NOT NULL DEFAULT '',
      description VARCHAR(500) NOT NULL DEFAULT '',
      store_id VARCHAR(24) REFERENCES stores(id) ON DELETE CASCADE,
      is_active BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE UNIQUE INDEX labour_services_store_name_ci_unique ON labour_services (store_id, LOWER(name));
    CREATE INDEX labour_services_store_idx ON labour_services (store_id);
  `,
    { transaction },
  );
}

module.exports = { name: '019-labour-services', up };
