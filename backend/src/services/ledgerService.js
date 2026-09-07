const { initializeModels } = require('../db/models');
const { isValidId } = require('../db/id');
const ApiError = require('../utils/ApiError');
const { ACCOUNT } = require('../utils/finance');
const journalService = require('./journalService');

// Degrades a malformed/missing store id to "unscoped" rather than letting an
// invalid id reach a query.
function validStore(store) {
  return store && isValidId(store) ? store : undefined;
}

/**
 * Read-only financial views built on top of the journal: customer & vendor
 * statements (the Ledgers screen) and the cash / bank books (Cash & Bank
 * screen). Returns paisa; controllers convert to rupees.
 */

function parseRange({ from, to } = {}) {
  return {
    from: from ? new Date(from) : undefined,
    to: to ? new Date(to) : undefined,
  };
}

// List of customers with their receivable balance, for the ledger picker.
async function customerLedgers() {
  const { Customer } = initializeModels();
  const [customers, balances] = await Promise.all([
    Customer.findAll({ order: [['name', 'ASC']] }),
    journalService.balancesByRef(ACCOUNT.AR),
  ]);
  return customers.map((c) => ({ ...c.toJSON(), balance: balances.get(String(c.id)) || 0 }));
}

// List of vendors with their payable balance.
async function vendorLedgers() {
  const { Vendor } = initializeModels();
  const [vendors, balances] = await Promise.all([
    Vendor.findAll({ order: [['name', 'ASC']] }),
    journalService.balancesByRef(ACCOUNT.AP),
  ]);
  return vendors.map((v) => ({ ...v.toJSON(), balance: balances.get(String(v.id)) || 0 }));
}

// List of suppliers with their payable balance.
async function supplierLedgers() {
  const { Supplier } = initializeModels();
  const [suppliers, balances] = await Promise.all([
    Supplier.findAll({ order: [['name', 'ASC']] }),
    journalService.balancesByRef(ACCOUNT.AP_SUPPLIER),
  ]);
  return suppliers.map((s) => ({ ...s.toJSON(), balance: balances.get(String(s.id)) || 0 }));
}

// List of labourers with their payable balance (rent charged on sales that
// hasn't been paid out yet).
async function labourLedgers() {
  const { Labour } = initializeModels();
  const [labourers, balances] = await Promise.all([
    Labour.findAll({ order: [['name', 'ASC']] }),
    journalService.balancesByRef(ACCOUNT.AP_LABOUR),
  ]);
  return labourers.map((l) => ({ ...l.toJSON(), balance: balances.get(String(l.id)) || 0 }));
}

// List of transporters with their payable balance.
async function transporterLedgers() {
  const { Transporter } = initializeModels();
  const [transporters, balances] = await Promise.all([
    Transporter.findAll({ order: [['name', 'ASC']] }),
    journalService.balancesByRef(ACCOUNT.AP_TRANSPORT),
  ]);
  return transporters.map((tr) => ({ ...tr.toJSON(), balance: balances.get(String(tr.id)) || 0 }));
}

// Statement for one customer (AR), vendor (AP), or labourer (AP_LABOUR),
// optionally scoped to one store's transactions with them (their overall
// balance shown alongside stays business-wide — see customerLedgers/
// vendorLedgers/labourLedgers — only this drill-down statement narrows).
async function partyStatement(kind, id, { store, ...range } = {}) {
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

  const statement = await journalService.accountStatement(account, party.id, {
    ...parseRange(range),
    store: validStore(store),
  });
  return { party, ...statement };
}

// Cash book (the singleton CASH account), optionally scoped to one store's
// till.
async function cashLedger({ store, ...range } = {}) {
  return journalService.accountStatement(ACCOUNT.CASH, null, {
    ...parseRange(range),
    store: validStore(store),
  });
}

// Statement for one bank account, optionally scoped to one store.
async function bankLedger(id, { store, ...range } = {}) {
  const { BankAccount } = initializeModels();
  const bank = await BankAccount.findByPk(id);
  if (!bank) throw ApiError.notFound('Bank account not found');
  const statement = await journalService.accountStatement(ACCOUNT.BANK, bank.id, {
    ...parseRange(range),
    store: validStore(store),
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
