/**
 * Seed a starter product catalog (categories, brands, units of measure) for
 * every store, so each store's product-form dropdowns have sensible options
 * right after it's provisioned. Categories/brands/units belong to one store
 * each (see catalogService). Idempotent: each entry is created only if a
 * same-name one doesn't already exist in that store.
 *
 * Stores that share a warehouse (see _canonicalStores.js) are seeded once,
 * not once each — otherwise every dropdown that lists across stores (the
 * inventory category filter, "All Stores" catalog view, ...) shows N unused
 * duplicate copies of the same name, one per store sharing that inventory.
 *
 *   node src/scripts/seedCatalog.js          # seeds every distinct-inventory store
 *   node src/scripts/seedCatalog.js <storeId>  # seeds just one store
 */
const connectDB = require('../config/db');
const { getCanonicalStores } = require('./_canonicalStores');
const catalogService = require('../services/catalogService');

const CATEGORIES = [
  '16 Inch PVC Panels',
  'Louver Panels',
  'UV Sheets',
  'Crystal Board',
  'WPC Panels',
  'PU Stone',
  'Wall Mirror',
  'Wood Flooring',
  'Wallpapers',
  'Ceiling',
  'Hardware',
  'U',
];
const BRANDS = ['Logitech', 'Keychron', 'Generic'];
const UNITS = [
  { name: 'Piece', abbreviation: 'pc' },
  { name: 'Box', abbreviation: 'box' },
];

async function seedStore(store) {
  // No `actor` — an explicit `store` is enough (see storeScope.requireWriteStore).
  for (const name of CATEGORIES) {
    await catalogService.createEntry('category', undefined, { name, store });
  }
  for (const name of BRANDS) await catalogService.createEntry('brand', undefined, { name, store });
  for (const u of UNITS) await catalogService.createEntry('unit', undefined, { ...u, store });
}

async function seed() {
  const db = await connectDB();

  const storeIdArg = process.argv[2];
  const stores = storeIdArg ? [{ id: storeIdArg }] : await getCanonicalStores();

  if (!stores.length) {
    throw new Error('No stores found to seed.');
  }

  for (const store of stores) {
    await seedStore(store.id);
    // eslint-disable-next-line no-console
    console.log(`Catalog seeded for store ${store.name || store.id}`);
  }

  // eslint-disable-next-line no-console
  console.log(
    `Done: ${CATEGORIES.length} categories, ${BRANDS.length} brands, ${UNITS.length} units seeded across ${stores.length} store(s).`,
  );

  await db.close();
  process.exit(0);
}

seed().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
