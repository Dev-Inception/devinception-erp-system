/**
 * Deleting a product or warehouse that sales, stock receipts or other
 * documents still point at can't erase the row (those documents keep
 * referencing it), so it's soft-deleted instead: `deleted_at` hides it from
 * the inventory, pickers and warehouse list while old invoices still
 * resolve it. A deleted product's SKU becomes free for reuse.
 */
async function up(db, transaction) {
  await db.query(
    `
    ALTER TABLE products ADD COLUMN deleted_at TIMESTAMPTZ;
    ALTER TABLE warehouses ADD COLUMN deleted_at TIMESTAMPTZ;
    DROP INDEX products_sku_unique;
    CREATE UNIQUE INDEX products_sku_unique
      ON products (sku) WHERE sku <> '' AND deleted_at IS NULL;
  `,
    { transaction },
  );
}

module.exports = { name: '031-soft-delete-products-warehouses', up };
