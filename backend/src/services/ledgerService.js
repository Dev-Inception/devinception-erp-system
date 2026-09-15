const { initializeModels } = require('../db/models');
const ApiError = require('../utils/ApiError');
const { ACCOUNT } = require('../utils/finance');
const journalService = require('./journalService');
const { resolveStoreScope, storeWhere, assertStoreAccess } = require('../utils/storeScope');

/**
 * Read-only financial views built on top of the journal: customer & vendor
 * statements (the Ledgers screen) and the cash / bank books (Cash & Bank
 * screen). Returns paisa; controllers convert to rupees.
 *
 * Vendors, suppliers, labour and transporters each belong to exactly one
 * store (see db/migrations/010-vendor-supplier-transporter-labour-store-scope.js),
 * same as customers — every list below is scoped to the actor's own store(s).
 */

function parseRange({ from, to } = {}) {
  return {
    from: from ? new Date(from) : undefined,
    to: to ? new Date(to) : undefined,
  };
}

// List of customers with their receivable balance, for the ledger picker —
// scoped to the actor's own store(s), since customers (unlike vendors/
// suppliers/labour/transporters below) belong to exactly one store.
async function customerLedgers(actor) {
  const { Customer } = initializeModels();
  const { storeIds } = await resolveStoreScope({ actor });
  const [customers, balances] = await Promise.all([
    Customer.findAll({ where: storeWhere(storeIds), order: [['name', 'ASC']] }),
    journalService.balancesByRef(ACCOUNT.AR, { store: storeIds }),
  ]);
  return customers.map((c) => ({ ...c.toJSON(), balance: balances.get(String(c.id)) || 0 }));
}

// List of vendors with their payable balance, scoped to the actor's own
// store(s).
async function vendorLedgers(actor) {
  const { Vendor } = initializeModels();
  const { storeIds } = await resolveStoreScope({ actor });
  const [vendors, balances] = await Promise.all([
    Vendor.findAll({ where: storeWhere(storeIds), order: [['name', 'ASC']] }),
    journalService.balancesByRef(ACCOUNT.AP, { store: storeIds }),
  ]);
  return vendors.map((v) => ({ ...v.toJSON(), balance: balances.get(String(v.id)) || 0 }));
}

// List of suppliers with their payable balance, scoped to the actor's own
// store(s).
async function supplierLedgers(actor) {
  const { Supplier } = initializeModels();
  const { storeIds } = await resolveStoreScope({ actor });
  const [suppliers, balances] = await Promise.all([
    Supplier.findAll({ where: storeWhere(storeIds), order: [['name', 'ASC']] }),
    journalService.balancesByRef(ACCOUNT.AP_SUPPLIER, { store: storeIds }),
  ]);
  return suppliers.map((s) => ({ ...s.toJSON(), balance: balances.get(String(s.id)) || 0 }));
}

// List of labourers with their payable balance (rent charged on sales that
// hasn't been paid out yet), scoped to the actor's own store(s).
async function labourLedgers(actor) {
  const { Labour } = initializeModels();
  const { storeIds } = await resolveStoreScope({ actor });
  const [labourers, balances] = await Promise.all([
    Labour.findAll({ where: storeWhere(storeIds), order: [['name', 'ASC']] }),
    journalService.balancesByRef(ACCOUNT.AP_LABOUR, { store: storeIds }),
  ]);
  return labourers.map((l) => ({ ...l.toJSON(), balance: balances.get(String(l.id)) || 0 }));
}

// List of transporters with their payable balance, scoped to the actor's
// own store(s).
async function transporterLedgers(actor) {
  const { Transporter } = initializeModels();
  const { storeIds } = await resolveStoreScope({ actor });
  const [transporters, balances] = await Promise.all([
    Transporter.findAll({ where: storeWhere(storeIds), order: [['name', 'ASC']] }),
    journalService.balancesByRef(ACCOUNT.AP_TRANSPORT, { store: storeIds }),
  ]);
  return transporters.map((tr) => ({ ...tr.toJSON(), balance: balances.get(String(tr.id)) || 0 }));
}

// Statement for one customer (AR), vendor (AP), or labourer (AP_LABOUR). A
// store-restricted actor's own store(s) always win over the query param
// (resolveStoreScope throws on a foreign one) and default to "all of their
// stores" when omitted — narrowing the transactions shown, exactly like
// every other report in the app. The actor must also own the party itself
// (every kind belongs to exactly one store), not just the store filter.
async function partyStatement(actor, kind, id, { store, ...range } = {}) {
  const { Customer, Vendor, Supplier, Labour, Transporter } = initializeModels();
  let party;
  let account;
  if (kind === 'customer') {
    party = await Customer.findByPk(id);
    account = ACCOUNT.AR;
  } else if (kind === 'vendor') {
    party = await Vendor.findByPk(id);
    account = ACCOUNT.AP;
  } else if (kind === 'supplier') {
    party = await Supplier.findByPk(id);
    account = ACCOUNT.AP_SUPPLIER;
  } else if (kind === 'labour') {
    party = await Labour.findByPk(id);
    account = ACCOUNT.AP_LABOUR;
  } else if (kind === 'transport') {
    party = await Transporter.findByPk(id);
    account = ACCOUNT.AP_TRANSPORT;
  } else {
    throw ApiError.badRequest(
      "Ledger kind must be 'customer', 'vendor', 'supplier', 'labour', or 'transport'",
    );
  }
  if (!party) throw ApiError.notFound(`${kind} not found`);
  if (party.store) assertStoreAccess(actor, party.store);

  const { storeIds } = await resolveStoreScope({ store, actor });
  const statement = await journalService.accountStatement(account, party.id, {
    ...parseRange(range),
    store: storeIds,
  });
  return { party, ...statement };
}

// Cash book (the singleton CASH account) — same store resolution as above.
async function cashLedger(actor, { store, ...range } = {}) {
  const { storeIds } = await resolveStoreScope({ store, actor });
  return journalService.accountStatement(ACCOUNT.CASH, null, {
    ...parseRange(range),
    store: storeIds,
  });
}

// Statement for one bank account — tenant-owned (unlike vendors/suppliers/
// labour/transporters), so the actor must own the account's own store too.
async function bankLedger(actor, id, { store, ...range } = {}) {
  const { BankAccount } = initializeModels();
  const bank = await BankAccount.findByPk(id);
  if (!bank) throw ApiError.notFound('Bank account not found');
  if (bank.store) assertStoreAccess(actor, bank.store);

  const { storeIds } = await resolveStoreScope({ store, actor });
  const statement = await journalService.accountStatement(ACCOUNT.BANK, bank.id, {
    ...parseRange(range),
    store: storeIds,
  });
  return { bank, ...statement };
}

module.exports = {
  customerLedgers,
  vendorLedgers,
  supplierLedgers,
  labourLedgers,
  transporterLedgers,
  partyStatement,
  cashLedger,
  bankLedger,
};
