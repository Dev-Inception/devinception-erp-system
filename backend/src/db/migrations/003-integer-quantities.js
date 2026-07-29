const name = '003-integer-quantities';

async function up(db, transaction) {
  await db.query(
    `
    DO $$
    BEGIN
      IF EXISTS (SELECT 1 FROM products WHERE min_stock <> TRUNC(min_stock))
        OR EXISTS (SELECT 1 FROM stock_levels WHERE quantity <> TRUNC(quantity))
        OR EXISTS (SELECT 1 FROM stock_movements WHERE quantity <> TRUNC(quantity))
        OR EXISTS (SELECT 1 FROM sale_items WHERE quantity <> TRUNC(quantity))
        OR EXISTS (SELECT 1 FROM goods_purchase_items WHERE quantity <> TRUNC(quantity))
        OR EXISTS (SELECT 1 FROM invoice_items WHERE quantity <> TRUNC(quantity))
        OR EXISTS (SELECT 1 FROM gate_pass_items WHERE quantity <> TRUNC(quantity))
        OR EXISTS (
          SELECT 1 FROM gate_pass_items
          WHERE loaded_quantity IS NOT NULL
            AND loaded_quantity <> TRUNC(loaded_quantity)
        )
      THEN
        RAISE EXCEPTION
          'Cannot enforce integer quantities while fractional inventory data exists';
      END IF;
    END
    $$;

    ALTER TABLE products
      ALTER COLUMN min_stock TYPE INTEGER USING min_stock::INTEGER;
    ALTER TABLE stock_levels
      ALTER COLUMN quantity TYPE INTEGER USING quantity::INTEGER;
    ALTER TABLE stock_movements
      ALTER COLUMN quantity TYPE INTEGER USING quantity::INTEGER;
    ALTER TABLE sale_items
      ALTER COLUMN quantity TYPE INTEGER USING quantity::INTEGER;
    ALTER TABLE goods_purchase_items
      ALTER COLUMN quantity TYPE INTEGER USING quantity::INTEGER;
    ALTER TABLE invoice_items
      ALTER COLUMN quantity TYPE INTEGER USING quantity::INTEGER;
    ALTER TABLE gate_pass_items
      ALTER COLUMN quantity TYPE INTEGER USING quantity::INTEGER,
      ALTER COLUMN loaded_quantity TYPE INTEGER USING loaded_quantity::INTEGER;
    `,
    { transaction },
  );
}

module.exports = { name, up };
