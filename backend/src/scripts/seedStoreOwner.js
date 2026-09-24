/**
 * Seed the starter customer: a store owner (ADMIN) the super admin has
 * "sold" three stores to — the same shape subscriptionService.
 * provisionSubscription produces (owner user + store + store_admins
 * membership + subscription per store) — plus the warehouse the stores
 * stock from. Runs right after seedSuperAdmin.js in seedAll.js, so every
 * store-scoped seeder after it (catalog, labour services, vendors, PVC
 * inventory) lands in this owner's stores.
 *
 * All three stores share one warehouse (one physical inventory), matching
 * how the business actually runs — see _canonicalStores.js for how the
 * inventory-scoped seeders handle that.
 *
 * Idempotent: the owner is matched by email, stores by name, the warehouse
 * by name; memberships/subscriptions/links are only added when missing. An
 * existing owner's password is never reset.
 *
 *   node src/scripts/seedStoreOwner.js
 */
const connectDB = require('../config/db');
const { initializeModels } = require('../db/models');
const { getPostgres } = require('../db/postgres');
const { ROLES } = require('../utils/constants');

const OWNER = {
  name: 'Hasnain',
  email: 'hasnain@gmail.com',
  // Initial password only — the owner should change it after first login.
  password: '1234567890',
};

const STORE_NAMES = [
  'HKZ Interiors Beadon Road',
  'HKZ Interiors College Road',
  'Nova Enterprises Beadon Road',
];

const WAREHOUSE_NAME = 'Warehouse1';

async function findOrCreateOwner(User, transaction) {
  const existing = await User.findOne({ where: { email: OWNER.email }, transaction });
  if (existing) {
    if (existing.role !== ROLES.ADMIN) {
      throw new Error(`${OWNER.email} already exists with role ${existing.role}, not admin`);
    }
    return { owner: existing, created: false };
  }
  const owner = await User.create({ ...OWNER, role: ROLES.ADMIN, store: null }, { transaction });
  return { owner, created: true };
}

async function findOrCreateWarehouse(Warehouse, transaction) {
  const existing = await Warehouse.findOne({ where: { name: WAREHOUSE_NAME }, transaction });
  if (existing) return existing;
  const hasDefault = await Warehouse.count({ where: { isDefault: true }, transaction });
  return Warehouse.create(
    { name: WAREHOUSE_NAME, isDefault: hasDefault === 0, isActive: true },
    { transaction },
  );
}

async function seed() {
  const db = await connectDB();
  const { User, Store, StoreAdmin, StoreWarehouse, Subscription, Warehouse } = initializeModels();

  const summary = await getPostgres().transaction(async (transaction) => {
    const { owner, created } = await findOrCreateOwner(User, transaction);
    const warehouse = await findOrCreateWarehouse(Warehouse, transaction);
    const lines = [];

    for (const name of STORE_NAMES) {
      let store = await Store.findOne({ where: { name }, transaction });
      const storeCreated = !store;
      if (!store) {
        const hasDefault = await Store.count({ where: { isDefault: true }, transaction });
        store = await Store.create(
          { name, isActive: true, isDefault: hasDefault === 0 },
          { transaction },
        );
      }

      await StoreAdmin.findOrCreate({
        where: { userId: owner.id, storeId: store.id },
        transaction,
      });
      await StoreWarehouse.findOrCreate({
        where: { storeId: store.id, warehouseId: warehouse.id },
        transaction,
      });
      // One subscription per store (unique on store_id). Sold offline, so
      // the amount is left at 0 for the super admin to fill in.
      await Subscription.findOrCreate({
        where: { store: store.id },
        defaults: { owner: owner.id, amount: 0, notes: 'Seeded starter store' },
        transaction,
      });

      lines.push(`  ${storeCreated ? 'created' : 'exists '}  ${name}`);
    }

    return [
      `Owner ${created ? 'created' : 'already exists'}: ${owner.name} <${owner.email}>`,
      `Warehouse: ${warehouse.name}`,
      'Stores:',
      ...lines,
    ];
  });

  // eslint-disable-next-line no-console
  console.log(summary.join('\n'));

  await db.close();
  process.exit(0);
}

seed().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
