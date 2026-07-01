/**
 * Seed a starter product catalog (categories, brands, units of measure) so the
 * product-form dropdowns have sensible options on a fresh database. Idempotent:
 * each entry is created only if a same-name one doesn't already exist.
 *
 *   node src/scripts/seedCatalog.js
 */
const mongoose = require('mongoose');
const connectDB = require('../config/db');
const catalogService = require('../services/catalogService');

const CATEGORIES = ['Electronics', 'Accessories', 'Office Supplies'];
const BRANDS = ['Logitech', 'Keychron', 'Generic'];
const UNITS = [
  { name: 'Piece', abbreviation: 'pc' },
  { name: 'Box', abbreviation: 'box' },
];

async function seed() {
  await connectDB();

  for (const name of CATEGORIES) await catalogService.createEntry('category', { name });
  for (const name of BRANDS) await catalogService.createEntry('brand', { name });
  for (const u of UNITS) await catalogService.createEntry('unit', u);

  // eslint-disable-next-line no-console
  console.log(
    `Catalog seeded: ${CATEGORIES.length} categories, ${BRANDS.length} brands, ${UNITS.length} units`,
  );

  await mongoose.connection.close();
  process.exit(0);
}

seed().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
