/**
 * Seed a PVC/WPC panel + hardware inventory batch (10", 16" and 6" panels,
 * WPC panels, louver panels, and loose hardware/ceiling parts) as opening
 * stock into one store/warehouse.
 *
 * The store and warehouse aren't hardcoded — pass their ids (they must
 * already exist; create them in the app first). If a warehouse id isn't
 * given, the store must have exactly one warehouse linked to it.
 *
 * Idempotent and safe to re-run: a SKU that already exists (globally — SKUs
 * are unique across the whole system) is left alone, and only newly created
 * products are receipted in.
 *
 *   node src/scripts/seedPvcPanelInventory.js <storeId> [warehouseId]
 */
const connectDB = require('../config/db');
const { initializeModels } = require('../db/models');
const catalogService = require('../services/catalogService');
const productService = require('../services/productService');
const stockReceiptService = require('../services/stockReceiptService');

const SUPPLIER_NAME = 'Opening Stock';

const CATEGORIES = [
  '10 Inch PVC Panels',
  '16 Inch PVC Panels',
  'WPC Panels',
  'Louver Panels',
  'Hardware / Ceiling',
];

// [sku, category, openingQuantity]
const ITEMS = [
  // 10 INCH — 10 Inch PVC Panels
  ['MD-551', '10 Inch PVC Panels', 52],
  ['MD-542', '10 Inch PVC Panels', 139],
  ['MD-561', '10 Inch PVC Panels', 227],
  ['MLV-278', '10 Inch PVC Panels', 371],
  ['MH-75', '10 Inch PVC Panels', 215],
  ['MD-135', '10 Inch PVC Panels', 123],
  ['ML-145', '10 Inch PVC Panels', 39],
  ['MLV-534', '10 Inch PVC Panels', 116],
  ['MLV-535', '10 Inch PVC Panels', 83],
  ['MD-277', '10 Inch PVC Panels', 11],
  ['MD-108', '10 Inch PVC Panels', 324],
  ['MH-197', '10 Inch PVC Panels', 22],
  ['MH-199', '10 Inch PVC Panels', 34],
  ['MD-111', '10 Inch PVC Panels', 9],
  ['MD-550', '10 Inch PVC Panels', 5],
  ['MD-554', '10 Inch PVC Panels', 128],
  ['MD-220', '10 Inch PVC Panels', 6],
  ['MD-575', '10 Inch PVC Panels', 228],
  ['MD-582', '10 Inch PVC Panels', 148],
  ['MD-123', '10 Inch PVC Panels', 190],
  ['ML-581', '10 Inch PVC Panels', 142],
  ['ML-342', '10 Inch PVC Panels', 338],
  ['ML-812', '10 Inch PVC Panels', 88],
  ['MD-7126', '10 Inch PVC Panels', 128],
  ['MD-342', '10 Inch PVC Panels', 238],
  ['ML-318', '10 Inch PVC Panels', 524],
  ['MH-116', '10 Inch PVC Panels', 163],
  ['MH-110', '10 Inch PVC Panels', 242],
  ['MD-173', '10 Inch PVC Panels', 238],
  ['MH-657', '10 Inch PVC Panels', 213],
  ['MH-12', '10 Inch PVC Panels', 309],
  ['MD-204', '10 Inch PVC Panels', 242],
  ['MD-118', '10 Inch PVC Panels', 281],
  ['MD-560', '10 Inch PVC Panels', 262],
  ['ML-001', '10 Inch PVC Panels', 16],
  // 16 INCH — 16 Inch PVC Panels
  ['3080', '16 Inch PVC Panels', 54],
  ['3077', '16 Inch PVC Panels', 320],
  ['3076', '16 Inch PVC Panels', 190],
  ['3054', '16 Inch PVC Panels', 47],
  ['3023', '16 Inch PVC Panels', 194],
  ['3034', '16 Inch PVC Panels', 66],
  ['3003', '16 Inch PVC Panels', 4],
  // 8 INCH — WPC Panels
  ['WPC-222', 'WPC Panels', 34],
  ['MW-188', 'WPC Panels', 191],
  ['MW-550', 'WPC Panels', 137],
  ['MW-552', 'WPC Panels', 10],
  ['MW-113', 'WPC Panels', 94],
  ['WPC-347', 'WPC Panels', 64],
  ['WPC-24A', 'WPC Panels', 24],
  ['MW-174', 'WPC Panels', 167],
  ['MW-561', 'WPC Panels', 17],
  ['MW-167', 'WPC Panels', 59],
  ['MW-108', 'WPC Panels', 48],
  ['MW-548', 'WPC Panels', 33],
  // 7 INCH (12mm thickness) — Louver Panels
  ['MF-8014', 'Louver Panels', 123],
  ['MF-54', 'Louver Panels', 91],
  // 6 INCH (25mm thickness) — WPC Panels
  ['WPC-060', 'WPC Panels', 52],
  ['WPC-075', 'WPC Panels', 24],
  ['WPC-053', 'WPC Panels', 6],
  ['WPC-051', 'WPC Panels', 12],
  // HARDWARE / CEILING
  ['Angle', 'Hardware / Ceiling', 39],
  ['Tee', 'Hardware / Ceiling', 128],
  ['Cross', 'Hardware / Ceiling', 1358],
  ['Nail Box', 'Hardware / Ceiling', 92],
  ['Silicon', 'Hardware / Ceiling', 143],
  ['Elfi', 'Hardware / Ceiling', 190],
];

async function resolveWarehouse(StoreWarehouse, storeId, warehouseIdArg) {
  if (warehouseIdArg) return warehouseIdArg;
  const links = await StoreWarehouse.findAll({ where: { storeId } });
  if (links.length === 1) return links[0].warehouseId;
  if (links.length === 0) {
    throw new Error(`Store ${storeId} has no warehouse linked to it. Create one first.`);
  }
  throw new Error(
    `Store ${storeId} has ${links.length} warehouses — pass one explicitly: ` +
      `node src/scripts/seedPvcPanelInventory.js ${storeId} <warehouseId>`,
  );
}

async function seed() {
  const db = await connectDB();
  const { Store, StoreWarehouse, Product, Supplier } = initializeModels();

  const storeId = process.argv[2];
  const warehouseIdArg = process.argv[3];
  if (!storeId) {
    throw new Error('Usage: node src/scripts/seedPvcPanelInventory.js <storeId> [warehouseId]');
  }
  const store = await Store.findByPk(storeId);
  if (!store) throw new Error(`Store not found: ${storeId}`);
  const warehouseId = await resolveWarehouse(StoreWarehouse, storeId, warehouseIdArg);

  for (const name of CATEGORIES) {
    await catalogService.createEntry('category', undefined, { name, store: storeId });
  }
  await catalogService.createEntry('unit', undefined, {
    name: 'Piece',
    abbreviation: 'pc',
    store: storeId,
  });

  let supplier = await Supplier.findOne({ where: { store: storeId, name: SUPPLIER_NAME } });
  if (!supplier) {
    supplier = await Supplier.create({ store: storeId, name: SUPPLIER_NAME });
  }

  const receiptItems = [];
  let created = 0;
  let skipped = 0;
  for (const [sku, category, quantity] of ITEMS) {
    const existing = await Product.findOne({ where: { sku: sku.toUpperCase() } });
    if (existing) {
      skipped += 1;
      continue;
    }
    const product = await productService.createProduct(undefined, {
      name: `${category} ${sku}`,
      sku,
      category,
      unit: 'Piece',
      warehouse: warehouseId,
      store: storeId,
    });
    receiptItems.push({ product: product._id, receivedQuantity: quantity, damagedQuantity: 0 });
    created += 1;
  }

  if (receiptItems.length) {
    await stockReceiptService.createReceipt(undefined, {
      supplier: supplier.id,
      store: storeId,
      warehouse: warehouseId,
      date: new Date().toISOString().slice(0, 10),
      items: receiptItems,
      isOpeningStock: true,
      note: 'Opening stock — PVC/WPC panel + hardware inventory batch',
    });
  }

  // eslint-disable-next-line no-console
  console.log(
    `PVC panel inventory seeded: ${created} product(s) created and received, ${skipped} already existed and were skipped.`,
  );

  await db.close();
  process.exit(0);
}

seed().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
