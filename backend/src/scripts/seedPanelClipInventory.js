/**
 * Seed the panel/clip inventory batch (source sheet ref "4495"): 4 catalog
 * categories (Hot Stamp Panel, V Panel, D Panel, Clip) and their products,
 * received as opening stock into an existing store/warehouse.
 *
 * A few source codes are reused across two categories (MH19, MH416, MH164
 * each appear once as a panel and once as a clip) — those become two
 * distinct products, disambiguated with a "-CLIP" suffix on the clip side.
 * A few rows repeat the exact same code *and* category with a different
 * quantity (e.g. ML220 appears twice under Clip) — those are summed into
 * one opening quantity per product.
 *
 * Idempotent and safe to re-run: a SKU that already exists is left alone
 * (no duplicate product, no double-counted stock) and only newly created
 * products are receipted in.
 *
 *   node src/scripts/seedPanelClipInventory.js
 */
const connectDB = require('../config/db');
const { initializeModels } = require('../db/models');
const catalogService = require('../services/catalogService');
const productService = require('../services/productService');
const supplierService = require('../services/supplierService');
const stockReceiptService = require('../services/stockReceiptService');
const env = require('../config/env');

const STORE_NAME = 'Pak interiors';
const WAREHOUSE_NAME = 'Bedian warehouse';
const SUPPLIER_NAME = 'Opening Stock';

const CATEGORIES = ['Hot Stamp Panel', 'V Panel', 'D Panel', 'Clip'];

// [sku, category, openingQuantity]
const ITEMS = [
  // Hot Stamp Panel
  ['MH19', 'Hot Stamp Panel', 269],
  ['MH416', 'Hot Stamp Panel', 288],
  ['MH164', 'Hot Stamp Panel', 205],
  ['MH173', 'Hot Stamp Panel', 240],
  // V Panel
  ['MLV342', 'V Panel', 351],
  ['MLV812', 'V Panel', 249],
  ['MLV581', 'V Panel', 188],
  // D Panel
  ['MD7126', 'D Panel', 208],
  ['MD123', 'D Panel', 229],
  ['MD575', 'D Panel', 270],
  ['MD220', 'D Panel', 313],
  ['MD342', 'D Panel', 255],
  ['MD554', 'D Panel', 356],
  ['MD582', 'D Panel', 150],
  // Clip
  ['ML7126', 'Clip', 120],
  ['ML173', 'Clip', 180],
  ['ML812', 'Clip', 120],
  ['ML581', 'Clip', 180],
  ['ML582', 'Clip', 60],
  ['ML123', 'Clip', 180],
  ['ML220', 'Clip', 120 + 48],
  ['ML342', 'Clip', 240 + 84],
  ['ML554', 'Clip', 120 + 55],
  ['ML575', 'Clip', 180],
  // Codes reused from the panel list above, disambiguated for the clip side.
  ['MH19-CLIP', 'Clip', 180],
  ['MH416-CLIP', 'Clip', 76 + 120],
  ['MH164-CLIP', 'Clip', 76 + 120],
];

async function seed() {
  const db = await connectDB();
  const { Store, Warehouse, Product, User } = initializeModels();

  const store = await Store.findOne({ where: { name: STORE_NAME } });
  if (!store) throw new Error(`Store not found: ${STORE_NAME}`);
  const warehouse = await Warehouse.findOne({ where: { name: WAREHOUSE_NAME } });
  if (!warehouse) throw new Error(`Warehouse not found: ${WAREHOUSE_NAME}`);
  const actor = await User.findOne({ where: { email: env.superAdmin.email } });

  for (const name of CATEGORIES) await catalogService.createEntry('category', { name });
  await catalogService.createEntry('unit', { name: 'Piece', abbreviation: 'pc' });

  let supplier = await supplierService
    .listSuppliers({ search: SUPPLIER_NAME })
    .then((r) => r.suppliers.find((s) => s.name === SUPPLIER_NAME));
  if (!supplier) supplier = await supplierService.createSupplier({ name: SUPPLIER_NAME });

  const receiptItems = [];
  let created = 0;
  let skipped = 0;
  for (const [sku, category, quantity] of ITEMS) {
    const existing = await Product.findOne({ where: { sku: sku.toUpperCase() } });
    if (existing) {
      skipped += 1;
      continue;
    }
    const product = await productService.createProduct({
      name: `${category} ${sku}`,
      sku,
      category,
      unit: 'Piece',
      warehouse: warehouse.id,
    });
    receiptItems.push({ product: product._id, receivedQuantity: quantity, damagedQuantity: 0 });
    created += 1;
  }

  if (receiptItems.length) {
    await stockReceiptService.createReceipt(actor, {
      supplier: supplier.id,
      store: store.id,
      warehouse: warehouse.id,
      date: new Date(),
      items: receiptItems,
      isOpeningStock: true,
      note: 'Opening stock — panel/clip inventory batch (sheet ref 4495)',
    });
  }

  // eslint-disable-next-line no-console
  console.log(
    `Panel/clip inventory seeded: ${created} product(s) created and received, ${skipped} already existed and were skipped.`,
  );

  await db.close();
  process.exit(0);
}

seed().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
