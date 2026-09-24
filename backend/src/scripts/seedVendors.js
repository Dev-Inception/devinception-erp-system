/**
 * Seed the starter vendor list (market contacts the store sources
 * vendor-supplied items from) for every store. Vendors belong to one store
 * each (see db/migrations/010-vendor-supplier-transporter-labour-store-scope.js).
 * Idempotent: a vendor is skipped if the store already has one with the same
 * phone number, or the same name (case-insensitive) — so re-running, or
 * running after someone has already added a few of these by hand, never
 * creates duplicates.
 *
 * Unlike seedLabourServices.js, every store is seeded — including stores
 * that share a warehouse — since vendor lists are strictly per-store and
 * each store should see the same market contacts.
 *
 *   node src/scripts/seedVendors.js            # seeds every store
 *   node src/scripts/seedVendors.js <storeId>  # seeds just one store
 */
const connectDB = require('../config/db');
const { initializeModels } = require('../db/models');

const VENDORS = [
  { name: 'Shanghai Wall Panel', phone: '0322-5084557' },
  { name: 'Golden Interior (Delux)', phone: '0321-9440935' },
  { name: 'Haji Aluminium', phone: '0308-4216403' },
  { name: 'Classic Interior', phone: '0322-2466664' },
  { name: 'Mashallah Thermopore', phone: '0307-6368188' },
  { name: 'Mian G Traders', phone: '0300-4741024' },
  { name: 'Nazir Sons', phone: '0321-8439886' },
  { name: 'New Thermopore Centre', phone: '0333-4386837' },
  { name: 'Copper Decor', phone: '0347-4012482' },
  { name: 'PVC House', phone: '0333-4296849' },
  { name: 'Move Plast', phone: '0313-5432000' },
  { name: 'PVC Wall Mart', phone: '0345-4222235' },
  { name: 'Ajmal Sons', phone: '0321-4670586' },
  { name: 'Manzoor Sons', phone: '0306-0000246' },
  { name: 'Paragon', phone: '0320-4105238' },
  { name: 'Zeeshan Traders', phone: '0300-8808944' },
  { name: 'Akhtar Sons', phone: '0301-4148701' },
  { name: 'Star', phone: '0309-9078804' },
  { name: 'MMC Hardware', phone: '0331-4321707' },
  { name: 'United Enterprises', phone: '0336-4204409' },
  { name: 'ZZ Decor', phone: '0337-4813016' },
  { name: 'Final Choice', phone: '0322-4142546' },
  { name: 'Mir and Sons', phone: '0309-1222216' },
  { name: 'Bismillah Int.', phone: '0335-4496040' },
  { name: 'Noor Interior', phone: '0321-4946049' },
  { name: 'Rizwan Imperial', phone: '0321-9178022' },
  { name: 'DR Homes', phone: '0317-3174174' },
  { name: 'Milano', phone: '0347-7111106' },
  { name: 'Milano Ex', phone: '0307-7779949' },
  { name: 'HS Trader', phone: '0322-2400747' },
  { name: 'D Decora', phone: '0322-4899122' },
  { name: 'Master Covering', phone: '0300-4285284' },
  { name: 'Janan Homes Interiors', phone: '0343-0740022' },
  { name: 'Marflex (Sharukh)', phone: '0321-4431197' },
  { name: 'Euro (Zakir)', phone: '0344-4447521' },
];

// Compare phones by digits only, so "0322-5084557" matches "03225084557".
const digits = (s) => String(s || '').replace(/\D/g, '');

async function seedStore(Vendor, store) {
  const existing = await Vendor.findAll({ where: { store }, attributes: ['name', 'phone'] });
  const names = new Set(existing.map((v) => v.name.trim().toLowerCase()));
  const phones = new Set(existing.map((v) => digits(v.phone)).filter(Boolean));

  let created = 0;
  for (const v of VENDORS) {
    if (names.has(v.name.toLowerCase()) || phones.has(digits(v.phone))) continue;
    await Vendor.create({ name: v.name, phone: v.phone, store });
    names.add(v.name.toLowerCase());
    phones.add(digits(v.phone));
    created += 1;
  }
  return created;
}

async function seed() {
  const db = await connectDB();
  const { Vendor, Store } = initializeModels();

  const storeIdArg = process.argv[2];
  const stores = storeIdArg
    ? [{ id: storeIdArg }]
    : await Store.findAll({ attributes: ['id', 'name'], order: [['createdAt', 'ASC']] });

  if (!stores.length) {
    throw new Error('No stores found to seed.');
  }

  for (const store of stores) {
    const created = await seedStore(Vendor, store.id);
    // eslint-disable-next-line no-console
    console.log(
      `Vendors seeded for store ${store.name || store.id}: ${created} created, ${VENDORS.length - created} already present`,
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
