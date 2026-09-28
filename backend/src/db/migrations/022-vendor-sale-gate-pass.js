/**
 * Vendor sales now get a gate pass too — stock physically leaves our
 * warehouse for the vendor, same as any customer sale (see
 * vendorSaleService.createVendorSale's comment), so it deserves the same
 * dispatch-authorization document. Adds a new 'VENDOR_SALE' source type
 * (direction OUT, see gatePassSerializer) alongside a `vendor_sale_id` link,
 * following the exact pattern 014-damaged-stock-returns.js used to add
 * 'SUPPLIER_RETURN'.
 */
async function up(db, transaction) {
  await db.query(
    `
    ALTER TABLE vendor_sales
      ADD COLUMN gate_pass_id VARCHAR(24) REFERENCES gate_passes(id) ON DELETE SET NULL;

    ALTER TABLE gate_passes
      ADD COLUMN vendor_sale_id VARCHAR(24) REFERENCES vendor_sales(id) ON DELETE RESTRICT;

    ALTER TABLE gate_passes DROP CONSTRAINT gate_passes_source_type_check;
    ALTER TABLE gate_passes ADD CONSTRAINT gate_passes_source_type_check
      CHECK (source_type IN ('SALE','RETURN','PURCHASE','SUPPLIER_RETURN','VENDOR_SALE'));

    ALTER TABLE gate_passes DROP CONSTRAINT gate_passes_check;
    ALTER TABLE gate_passes ADD CONSTRAINT gate_passes_check CHECK (
      (source_type = 'SALE' AND sale_id IS NOT NULL AND sale_return_id IS NULL AND stock_receipt_id IS NULL AND damaged_stock_return_id IS NULL AND vendor_sale_id IS NULL)
      OR
      (source_type = 'RETURN' AND sale_return_id IS NOT NULL AND sale_id IS NOT NULL AND stock_receipt_id IS NULL AND damaged_stock_return_id IS NULL AND vendor_sale_id IS NULL)
      OR
      (source_type = 'PURCHASE' AND stock_receipt_id IS NOT NULL AND sale_id IS NULL AND sale_return_id IS NULL AND damaged_stock_return_id IS NULL AND vendor_sale_id IS NULL)
      OR
      (source_type = 'SUPPLIER_RETURN' AND damaged_stock_return_id IS NOT NULL AND sale_id IS NULL AND sale_return_id IS NULL AND stock_receipt_id IS NULL AND vendor_sale_id IS NULL)
      OR
      (source_type = 'VENDOR_SALE' AND vendor_sale_id IS NOT NULL AND sale_id IS NULL AND sale_return_id IS NULL AND stock_receipt_id IS NULL AND damaged_stock_return_id IS NULL)
    );

    CREATE UNIQUE INDEX gate_passes_vendor_sale_unique
      ON gate_passes (vendor_sale_id)
      WHERE vendor_sale_id IS NOT NULL;
  `,
    { transaction },
  );
}

module.exports = { name: '022-vendor-sale-gate-pass', up };
