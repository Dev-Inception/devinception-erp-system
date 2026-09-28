/**
 * Seed the starter labour-service catalog (Ceiling, Panel, UV Sheet, Wood
 * Flooring, ...) for every store, so each store's labour-services list has
 * sensible options right after it's provisioned. Labour services belong to
 * one store each (see labourServiceService), same as categories/brands/units.
 * Idempotent: each entry is created only if a same-name one doesn't already
 * exist in that store (case-insensitive), since the DB enforces a unique
 * (store_id, LOWER(name)) index and won't allow literal duplicates.
 *
 * Stores that share a warehouse (see _canonicalStores.js) are seeded once,
 * not once each — otherwise a dropdown listing across stores shows N unused
 * duplicate copies of the same name, one per store sharing that inventory.
 *
 *   node src/scripts/seedLabourServices.js            # seeds every distinct-inventory store
 *   node src/scripts/seedLabourServices.js <storeId>    # seeds just one store
 */
const connectDB = require('../config/db');
const { initializeModels } = require('../db/models');
const { getCanonicalStores } = require('./_canonicalStores');

const LABOUR_SERVICES = [
  '10 Inch Panels (All Types)',
  '16 Inch Panels',
  '6 Inch — 25mm Thickness',
  '6 Inch — 10mm Thickness & 8 Inch — 8mm Thickness',
  'WPC Wall Panels',
  'UV Sheets',
  'Crystal Board (same tiers as UV Sheets)',
  'PU Stone',
  'Wood Flooring',
  'Vinyl Flooring',
  'Wallpaper',
  'Ceiling',
];

async function findOrCreate(LabourService, name, store) {
  const existing = await LabourService.findAll({ where: { store } }).then((rows) =>
    rows.find((r) => r.name.toLowerCase() === name.toLowerCase()),
  );
  if (existing) return existing;
  return LabourService.create({ name, store });
}

async function seedStore(LabourService, store) {
  for (const name of LABOUR_SERVICES) {
    await findOrCreate(LabourService, name, store);
  }
}

async function seed() {
  const db = await connectDB();
  const { LabourService } = initializeModels();

  const storeIdArg = process.argv[2];
  const stores = storeIdArg ? [{ id: storeIdArg }] : await getCanonicalStores();

  if (!stores.length) {
    throw new Error('No stores found to seed.');
  }

  for (const store of stores) {
    await seedStore(LabourService, store.id);
    // eslint-disable-next-line no-console
    console.log(`Labour services seeded for store ${store.name || store.id}`);
  }

  // eslint-disable-next-line no-console
  console.log(
    `Done: ${LABOUR_SERVICES.length} labour services seeded across ${stores.length} store(s).`,
  );

  await db.close();
  process.exit(0);
}

seed().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
