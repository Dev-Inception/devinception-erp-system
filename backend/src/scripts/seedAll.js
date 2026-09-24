/**
 * Run every seeder in one go, in the right order: super admin first (other
 * seeders don't need it, but it's the one true prerequisite for using the
 * app at all), then the starter store owner and the stores sold to them
 * (every store-scoped seeder below needs those stores to exist), then the
 * store-agnostic ones (catalog, labour services, vendors, labour, expense
 * categories — each already loops over every store itself), then the PVC
 * panel inventory batch last, since it needs an actual store + warehouse to
 * target.
 *
 * The PVC batch has no sensible "every store" meaning (SKUs are globally
 * unique — see seedPvcPanelInventory.js), so this picks whichever
 * store/warehouse pair it finds first and seeds the batch there once; every
 * store sharing that warehouse sees it. If no store/warehouse exists yet,
 * that step is skipped with a note instead of failing the whole run.
 *
 * Each seeder is its own idempotent script (safe to re-run, skips whatever
 * already exists) — this just calls them all in sequence as child
 * processes, so output streams through exactly as if you'd run them by hand.
 *
 *   npm run seed
 */
const path = require('path');
const { execFileSync } = require('child_process');
const connectDB = require('../config/db');
const { initializeModels } = require('../db/models');

function run(script, args = []) {
  // eslint-disable-next-line no-console
  console.log(`\n--- ${script}${args.length ? ` ${args.join(' ')}` : ''} ---`);
  execFileSync(process.execPath, [path.join(__dirname, script), ...args], { stdio: 'inherit' });
}

async function findPvcTarget() {
  const db = await connectDB();
  const { StoreWarehouse } = initializeModels();
  const link = await StoreWarehouse.findOne({ order: [['storeId', 'ASC']] });
  await db.close();
  return link ? { storeId: link.storeId, warehouseId: link.warehouseId } : null;
}

async function main() {
  run('seedSuperAdmin.js');
  run('seedStoreOwner.js');
  run('seedCatalog.js');
  run('seedLabourServices.js');
  run('seedVendors.js');
  run('seedLabour.js');
  run('seedExpenseCategories.js');

  const target = await findPvcTarget();
  if (target) {
    run('seedPvcPanelInventory.js', [target.storeId, target.warehouseId]);
  } else {
    // eslint-disable-next-line no-console
    console.log('\n--- seedPvcPanelInventory.js: skipped (no store/warehouse exists yet) ---');
  }

  // eslint-disable-next-line no-console
  console.log('\nAll seeders finished.');
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('\nSeeding stopped:', err.message || err);
  process.exit(1);
});
