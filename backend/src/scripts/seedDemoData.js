/**
 * Seed demo data for the sidebar's Catalog and Partners sections into one
 * store, so the app has something realistic to click through:
 *  - Catalog: categories, brands, units, labour services, and priced
 *    products split across the store's warehouses, received in as opening
 *    stock (one opening-stock receipt per warehouse).
 *  - Partners: customers, vendors, suppliers, transporters and labour.
 *
 * Test/development data only: refuses to run when NODE_ENV=production, and
 * build.js leaves it out of the deployment bundle. Not part of seedAll.js.
 *
 * Idempotent: catalog entries are created only if missing (see
 * catalogService.createEntry), a product is skipped if its SKU exists, and a
 * partner is skipped if the store already has one with the same name.
 *
 * With no store id, picks the first store that has a warehouse linked.
 *
 * SKUs are unique across every store, so seeding a second store's products
 * needs its own SKU prefix (replaces the default "DM").
 *
 *   node src/scripts/seedDemoData.js [storeId] [skuPrefix]
 */
const env = require('../config/env');
const connectDB = require('../config/db');
const { initializeModels } = require('../db/models');
const { toPaisa } = require('../utils/money');
const catalogService = require('../services/catalogService');
const labourServiceService = require('../services/labourServiceService');
const productService = require('../services/productService');
const stockReceiptService = require('../services/stockReceiptService');

const OPENING_SUPPLIER = 'Opening Stock';

const CATEGORIES = [
  'PVC Wall Panels',
  'WPC Panels',
  'UV Marble Sheets',
  'Wood Flooring',
  'Wallpapers',
  'False Ceiling',
  'Hardware',
];
const BRANDS = ['Marflex', 'Euro', 'Milano', 'Shanghai', 'Generic'];
const UNITS = [
  { name: 'Piece', abbreviation: 'pc' },
  { name: 'Box', abbreviation: 'box' },
  { name: 'Roll', abbreviation: 'roll' },
  { name: 'Sq. Ft', abbreviation: 'sqft' },
];
const LABOUR_SERVICES = [
  'Wall Panel Fixing',
  'Wooden Floor',
  'UV Sheet',
  'Cieling',
  'Wallpaper Pasting',
];

// [sku, name, category, brand, unit, purchase Rs, sale Rs, opening qty, min stock]
const PRODUCTS = [
  [
    'DM-PVC-101',
    'PVC Panel 10" White Gloss',
    'PVC Wall Panels',
    'Shanghai',
    'Piece',
    650,
    850,
    240,
    30,
  ],
  [
    'DM-PVC-102',
    'PVC Panel 10" Teak Wood',
    'PVC Wall Panels',
    'Shanghai',
    'Piece',
    700,
    920,
    180,
    30,
  ],
  [
    'DM-PVC-161',
    'PVC Panel 16" Grey Marble',
    'PVC Wall Panels',
    'Milano',
    'Piece',
    1150,
    1500,
    120,
    20,
  ],
  ['DM-PVC-162', 'PVC Panel 16" Walnut', 'PVC Wall Panels', 'Milano', 'Piece', 1150, 1500, 95, 20],
  ['DM-WPC-201', 'WPC Fluted Panel Oak', 'WPC Panels', 'Euro', 'Piece', 2400, 3100, 60, 10],
  ['DM-WPC-202', 'WPC Fluted Panel Charcoal', 'WPC Panels', 'Euro', 'Piece', 2400, 3100, 45, 10],
  [
    'DM-UV-301',
    'UV Marble Sheet Carrara 4x8',
    'UV Marble Sheets',
    'Marflex',
    'Piece',
    5200,
    6800,
    40,
    8,
  ],
  [
    'DM-UV-302',
    'UV Marble Sheet Black Gold 4x8',
    'UV Marble Sheets',
    'Marflex',
    'Piece',
    5600,
    7300,
    32,
    8,
  ],
  ['DM-WF-401', 'Laminate Flooring 8mm Oak', 'Wood Flooring', 'Euro', 'Box', 4800, 6200, 70, 10],
  [
    'DM-WF-402',
    'Laminate Flooring 12mm Walnut',
    'Wood Flooring',
    'Euro',
    'Box',
    6900,
    8800,
    50,
    10,
  ],
  ['DM-WP-501', 'Wallpaper 3D Brick', 'Wallpapers', 'Generic', 'Roll', 1400, 2000, 85, 15],
  ['DM-WP-502', 'Wallpaper Floral Beige', 'Wallpapers', 'Generic', 'Roll', 1250, 1800, 64, 15],
  ['DM-FC-601', 'Gypsum Ceiling Tile 2x2', 'False Ceiling', 'Generic', 'Piece', 280, 380, 400, 50],
  ['DM-FC-602', 'PVC Ceiling Tile 2x2', 'False Ceiling', 'Generic', 'Piece', 320, 450, 350, 50],
  ['DM-HW-701', 'Ceiling Main Tee 12ft', 'Hardware', 'Generic', 'Piece', 210, 300, 500, 60],
  ['DM-HW-702', 'Wall Angle 10ft', 'Hardware', 'Generic', 'Piece', 140, 200, 600, 60],
  ['DM-HW-703', 'Panel Clip (Box of 100)', 'Hardware', 'Generic', 'Box', 350, 500, 120, 20],
  ['DM-HW-704', 'Silicone Sealant Clear', 'Hardware', 'Generic', 'Piece', 450, 650, 150, 25],
];

const CUSTOMERS = [
  {
    name: 'Ahmed Raza',
    phone: '0300-1234567',
    address: 'DHA Phase 5, Lahore',
    creditLimit: 100000,
  },
  {
    name: 'Fatima Interiors',
    phone: '0321-2345678',
    email: 'orders@fatimainteriors.pk',
    address: 'Gulberg III, Lahore',
    creditLimit: 250000,
  },
  {
    name: 'Usman Builders',
    phone: '0333-3456789',
    address: 'Bahria Town, Lahore',
    creditLimit: 500000,
  },
  { name: 'Hina Khan', phone: '0345-4567890', address: 'Johar Town, Lahore' },
  { name: 'Zubair Ali', phone: '0301-5678901', address: 'Model Town, Lahore' },
  {
    name: 'Skyline Developers',
    phone: '0322-6789012',
    email: 'accounts@skylinedev.pk',
    address: 'Main Boulevard, Lahore',
    creditLimit: 750000,
  },
  { name: 'Ayesha Siddiqui', phone: '0315-7890123', address: 'Wapda Town, Lahore' },
  { name: 'Kamran Sheikh', phone: '0308-8901234', address: 'Township, Lahore', creditLimit: 50000 },
];
const VENDORS = [
  { name: 'PVC House', phone: '0333-4296849', address: 'Shah Alam Market, Lahore' },
  { name: 'Classic Interior', phone: '0322-2466664', address: 'Hall Road, Lahore' },
  { name: 'Noor Interior', phone: '0321-4946049', address: 'Ichhra, Lahore' },
  { name: 'DR Homes', phone: '0317-3174174', address: 'Ferozepur Road, Lahore' },
  { name: 'Copper Decor', phone: '0347-4012482', address: 'Mall Road, Lahore' },
];
const SUPPLIERS = [
  {
    name: 'Shanghai Wall Panel Co.',
    phone: '0322-5084557',
    email: 'sales@shanghaipanel.pk',
    ntn: '4512367-8',
    address: 'Sundar Industrial Estate, Lahore',
  },
  {
    name: 'Euro Flooring Imports',
    phone: '0344-4447521',
    ntn: '3398712-1',
    address: 'SITE Area, Karachi',
  },
  {
    name: 'Marflex Pakistan',
    phone: '0321-4431197',
    email: 'trade@marflex.pk',
    ntn: '7765123-4',
    address: 'Quaid-e-Azam Industrial Estate, Lahore',
  },
  {
    name: 'Milano Decor Pvt Ltd',
    phone: '0347-7111106',
    ntn: '2219834-6',
    address: 'I-9 Industrial Area, Islamabad',
  },
  { name: 'Gypsum Board Traders', phone: '0300-8808944', address: 'Badami Bagh, Lahore' },
];
const TRANSPORTERS = [
  {
    name: 'Al-Madina Goods Transport',
    phone: '0300-9876543',
    vehicleNumber: 'LES-4521',
    address: 'Badami Bagh, Lahore',
  },
  {
    name: 'Faisal Loader Service',
    phone: '0321-8765432',
    vehicleNumber: 'LEA-7788',
    address: 'Shahdara, Lahore',
  },
  {
    name: 'Khan Shehzore',
    phone: '0333-7654321',
    vehicleNumber: 'LEC-1290',
    address: 'Ravi Road, Lahore',
  },
  {
    name: 'City Mazda Rental',
    phone: '0345-6543210',
    vehicleNumber: 'LED-3345',
    address: 'Kot Lakhpat, Lahore',
  },
];
const LABOUR = [
  { name: 'Imran Fitter', phoneNumber: '0321-4068032' },
  { name: 'Arshad Carpenter', phoneNumber: '0321-4344017' },
  { name: 'Maqsood Ceiling', phoneNumber: '0307-4188790' },
  { name: 'Nadeem Floor Fixer', phoneNumber: '0321-4299725' },
  { name: 'Sajid Painter', phoneNumber: '0302-4455667' },
  { name: 'Rashid Helper', phoneNumber: '0311-2233445' },
];

const log = (...args) => console.log(...args); // eslint-disable-line no-console

async function pickStore(Store, StoreWarehouse, storeIdArg) {
  if (storeIdArg) {
    const store = await Store.findByPk(storeIdArg);
    if (!store) throw new Error(`Store not found: ${storeIdArg}`);
    return store;
  }
  const link = await StoreWarehouse.findOne({ order: [['storeId', 'ASC']] });
  if (!link) throw new Error('No store has a warehouse linked — create one in the app first.');
  return Store.findByPk(link.storeId);
}

// Creates each row the store doesn't already have (matched by name).
async function seedByName(Model, storeId, rows, map = (r) => r) {
  const existing = await Model.findAll({ where: { store: storeId }, attributes: ['name'] });
  const names = new Set(existing.map((r) => r.name.trim().toLowerCase()));
  let created = 0;
  for (const row of rows) {
    if (names.has(row.name.toLowerCase())) continue;
    await Model.create({ ...map(row), store: storeId });
    names.add(row.name.toLowerCase());
    created += 1;
  }
  return created;
}

async function seedCatalog(storeId) {
  for (const name of CATEGORIES) {
    await catalogService.createEntry('category', undefined, { name, store: storeId });
  }
  for (const name of BRANDS) {
    await catalogService.createEntry('brand', undefined, { name, store: storeId });
  }
  for (const u of UNITS)
    await catalogService.createEntry('unit', undefined, { ...u, store: storeId });

  const { LabourService } = initializeModels();
  const existing = await LabourService.findAll({ where: { store: storeId }, attributes: ['name'] });
  const names = new Set(existing.map((s) => s.name.trim().toLowerCase()));
  for (const name of LABOUR_SERVICES) {
    if (names.has(name.toLowerCase())) continue;
    await labourServiceService.createLabourService(undefined, { name, store: storeId });
  }
  log(
    `Catalog: ${CATEGORIES.length} categories, ${BRANDS.length} brands, ${UNITS.length} units, ${LABOUR_SERVICES.length} labour services ensured`,
  );
}

async function seedProducts(storeId, warehouseIds, skuPrefix) {
  const { Product, Supplier } = initializeModels();
  let supplier = await Supplier.findOne({ where: { store: storeId, name: OPENING_SUPPLIER } });
  if (!supplier) supplier = await Supplier.create({ store: storeId, name: OPENING_SUPPLIER });

  // Alternate products across the store's warehouses.
  const byWarehouse = new Map(warehouseIds.map((w) => [w, []]));
  let created = 0;
  for (const [i, row] of PRODUCTS.entries()) {
    const [baseSku, name, category, brand, unit, purchase, sale, qty, minStock] = row;
    const sku = baseSku.replace(/^DM-/, `${skuPrefix}-`);
    if (await Product.findOne({ where: { sku: sku.toUpperCase() } })) continue;
    const warehouse = warehouseIds[i % warehouseIds.length];
    const product = await productService.createProduct(undefined, {
      name,
      sku,
      category,
      brand,
      unit,
      purchasePrice: toPaisa(purchase),
      salePrice: toPaisa(sale),
      minStock,
      warehouse,
      store: storeId,
    });
    byWarehouse
      .get(warehouse)
      .push({ product: product._id, receivedQuantity: qty, damagedQuantity: 0 });
    created += 1;
  }

  for (const [warehouse, items] of byWarehouse) {
    if (!items.length) continue;
    await stockReceiptService.createReceipt(undefined, {
      supplier: supplier.id,
      store: storeId,
      warehouse,
      date: new Date().toISOString().slice(0, 10),
      items,
      isOpeningStock: true,
      note: 'Opening stock — demo catalog',
    });
  }
  log(
    `Products: ${created} created with opening stock, ${PRODUCTS.length - created} already existed`,
  );
}

async function seedPartners(storeId) {
  const { Customer, Vendor, Supplier, Transporter, Labour } = initializeModels();
  const withMoney = (r) => ({ ...r, creditLimit: toPaisa(r.creditLimit || 0) });
  const counts = {
    customers: await seedByName(Customer, storeId, CUSTOMERS, withMoney),
    vendors: await seedByName(Vendor, storeId, VENDORS),
    suppliers: await seedByName(Supplier, storeId, SUPPLIERS),
    transporters: await seedByName(Transporter, storeId, TRANSPORTERS),
    labour: await seedByName(Labour, storeId, LABOUR),
  };
  log(
    `Partners created: ${Object.entries(counts)
      .map(([k, v]) => `${v} ${k}`)
      .join(', ')}`,
  );
}

async function seed() {
  if (env.nodeEnv === 'production') {
    throw new Error('seedDemoData.js is test data only and will not run in production.');
  }
  const db = await connectDB();
  const { Store, StoreWarehouse } = initializeModels();
  const store = await pickStore(Store, StoreWarehouse, process.argv[2]);
  const links = await StoreWarehouse.findAll({ where: { storeId: store.id } });
  log(`Seeding demo data into store "${store.name}" (${store.id})`);

  await seedCatalog(store.id);
  if (links.length) {
    await seedProducts(
      store.id,
      links.map((l) => l.warehouseId),
      (process.argv[3] || 'DM').toUpperCase(),
    );
  } else {
    log('Products: skipped (store has no warehouse linked)');
  }
  await seedPartners(store.id);

  await db.close();
  process.exit(0);
}

seed().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
