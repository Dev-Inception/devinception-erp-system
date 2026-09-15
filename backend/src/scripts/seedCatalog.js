/**
 * Seed a starter product catalog (categories, brands, units of measure) for
 * one store, so its product-form dropdowns have sensible options right after
 * it's provisioned. Categories/brands/units belong to one store each (see
 * catalogService), so this now needs to know which store to seed. Idempotent:
 * each entry is created only if a same-name one doesn't already exist there.
 *
 *   node src/scripts/seedCatalog.js <storeId>
 */
const connectDB = require('../config/db');
const catalogService = require('../services/catalogService');

const CATEGORIES = ['Electronics', 'Accessories', 'Office Supplies'];
const BRANDS = ['Logitech', 'Keychron', 'Generic'];
const UNITS = [
  { name: 'Piece', abbreviation: 'pc' },
  { name: 'Box', abbreviation: 'box' },
];

async function seed() {
  const store = process.argv[2];
  if (!store) {
    throw new Error('Usage: node src/scripts/seedCatalog.js <storeId>');
  }
  const db = await connectDB();

  // No `actor` — an explicit `store` is enough (see storeScope.requireWriteStore).
  for (const name of CATEGORIES) {
    await catalogService.createEntry('category', undefined, { name, store });
  }
  for (const name of BRANDS) await catalogService.createEntry('brand', undefined, { name, store });
  for (const u of UNITS) await catalogService.createEntry('unit', undefined, { ...u, store });

  // eslint-disable-next-line no-console
  console.log(
    `Catalog seeded: ${CATEGORIES.length} categories, ${BRANDS.length} brands, ${UNITS.length} units`,
  );

  await db.close();
  process.exit(0);
}

seed().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
