/**
 * Seed the starter labourer list into every store owned by the starter
 * owner (see seedStoreOwner.js), so each of their stores can attach these
 * labourers to sales/stock receipts straight away. Labour belongs to one
 * store each (see db/migrations/010-vendor-supplier-transporter-labour-store-scope.js).
 *
 * Idempotent: a labourer is skipped if the store already has one with the
 * same phone number — the same uniqueness rule labourService.createLabour
 * enforces. Names aren't unique (there are two different "Arshad"s below),
 * so they're never used to match.
 *
 *   node src/scripts/seedLabour.js            # seeds every store the owner has
 *   node src/scripts/seedLabour.js <storeId>  # seeds just one store
 */
const connectDB = require('../config/db');
const { initializeModels } = require('../db/models');

// Must match OWNER.email in seedStoreOwner.js.
const OWNER_EMAIL = 'hasnain@gmail.com';

const LABOUR = [
  { name: 'M. Javaid', phoneNumber: '0305-6811094' },
  { name: 'Faheem', phoneNumber: '0345-1093998' },
  { name: 'Faisal', phoneNumber: '0328-7570600' },
  { name: 'Naeem', phoneNumber: '0306-6691090' },
  { name: 'Usman', phoneNumber: '0304-4240757' },
  { name: 'Sheray', phoneNumber: '0348-1063709' },
  { name: 'Waseem', phoneNumber: '0329-3570513' },
  { name: 'Ghulam Mustufa', phoneNumber: '0304-6366245' },
  { name: 'Abdul Star', phoneNumber: '0320-1011472' },
  { name: 'Bilal', phoneNumber: '0300-4626044' },
  { name: 'Anas', phoneNumber: '0316-4782460' },
  { name: 'Sajib', phoneNumber: '0320-4344718' },
  { name: 'Imran', phoneNumber: '0321-4068032' },
  { name: 'Arshad', phoneNumber: '0321-4344017' },
  { name: 'Arshad', phoneNumber: '0304-4048460' },
  { name: 'Maqsood', phoneNumber: '0307-4188790' },
  { name: 'Nadeem', phoneNumber: '0321-4299725' },
];

// Compare phones by digits only, so "0305-6811094" matches "03056811094".
const digits = (s) => String(s || '').replace(/\D/g, '');

async function seedStore(Labour, store) {
  const existing = await Labour.findAll({ where: { store }, attributes: ['phoneNumber'] });
  const phones = new Set(existing.map((l) => digits(l.phoneNumber)).filter(Boolean));

  let created = 0;
  for (const l of LABOUR) {
    if (phones.has(digits(l.phoneNumber))) continue;
    await Labour.create({ name: l.name, phoneNumber: l.phoneNumber, store });
    phones.add(digits(l.phoneNumber));
    created += 1;
  }
  return created;
}

async function ownerStores(User) {
  const owner = await User.findOne({ where: { email: OWNER_EMAIL }, include: ['adminStores'] });
  if (!owner) {
    throw new Error(`Starter owner ${OWNER_EMAIL} not found — run seedStoreOwner.js first.`);
  }
  return owner.adminStores || [];
}

async function seed() {
  const db = await connectDB();
  const { Labour, User } = initializeModels();

  const storeIdArg = process.argv[2];
  const stores = storeIdArg ? [{ id: storeIdArg }] : await ownerStores(User);

  if (!stores.length) {
    throw new Error('No stores found to seed.');
  }

  for (const store of stores) {
    const created = await seedStore(Labour, store.id);
    // eslint-disable-next-line no-console
    console.log(
      `Labour seeded for store ${store.name || store.id}: ${created} created, ${LABOUR.length - created} already present`,
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
