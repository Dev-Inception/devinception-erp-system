/**
 * Give every store (or one store) its default roles — Admin, Manager,
 * Cashier and Accountant — as its own store-scoped roles, so they show in
 * that store's Permissions section. Safe for production and to re-run: a
 * store that already has a role of the same name keeps it unchanged (see
 * roleService.ensureStoreDefaultRoles). New stores get these automatically
 * when created; this is for catching up existing ones by hand.
 *
 *   node src/scripts/seedStoreRoles.js            # every store
 *   node src/scripts/seedStoreRoles.js <storeId>  # just one store
 */
const connectDB = require('../config/db');
const { initializeModels } = require('../db/models');
const roleService = require('../services/roleService');

async function seed() {
  const db = await connectDB();
  const { Store } = initializeModels();

  const storeIdArg = process.argv[2];
  const stores = storeIdArg
    ? [await Store.findByPk(storeIdArg)].filter(Boolean)
    : await Store.findAll({ attributes: ['id', 'name'], order: [['createdAt', 'ASC']] });
  if (!stores.length)
    throw new Error(storeIdArg ? `Store not found: ${storeIdArg}` : 'No stores found.');

  for (const store of stores) {
    const created = await roleService.ensureStoreDefaultRoles(store.id);
    // eslint-disable-next-line no-console
    console.log(
      `Roles for store ${store.name || store.id}: ${created} created, ${roleService.STORE_DEFAULT_ROLES.length - created} already present`,
    );
  }

  await db.close();
  process.exit(0);
}

seed().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
