/**
 * Splits the catalog into two inventories:
 *  - warehouse products (is_vendor_product false) — stocked, as before;
 *  - vendor products (is_vendor_product true) — items bought from a vendor
 *    per sale (the vendor is picked on the sale line). They hold no stock,
 *    have no warehouse, and belong to the store they were added in
 *    (store_id).
 * Every existing product stays a warehouse product.
 */
async function up(db, transaction) {
  await db.query(
    `
    ALTER TABLE products ADD COLUMN is_vendor_product BOOLEAN NOT NULL DEFAULT false;
    ALTER TABLE products ADD COLUMN store_id VARCHAR(24) REFERENCES stores(id) ON DELETE RESTRICT;
    CREATE INDEX products_vendor_store_idx ON products (store_id) WHERE is_vendor_product;
  `,
    { transaction },
  );
}

module.exports = { name: '033-vendor-products', up };
