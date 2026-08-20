const mongoose = require('mongoose');
const Customer = require('../models/customerModel');
const Vendor = require('../models/vendorModel');
const Labour = require('../models/labourModel');
const BankAccount = require('../models/bankAccountModel');
const ApiError = require('../utils/ApiError');
const { ACCOUNT } = require('../utils/finance');
const journalService = require('./journalService');

// Degrades a malformed/missing store id to "unscoped" rather than letting an
// invalid ObjectId reach a Mongo query as a CastError.
function validStore(store) {
  return store && mongoose.isValidObjectId(store) ? store : undefined;
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
  const [customers, balances] = await Promise.all([
    Customer.find().sort({ name: 1 }).lean(),
    journalService.balancesByRef(ACCOUNT.AR),
  ]);
  return customers.map((c) => ({ ...c, balance: balances.get(String(c._id)) || 0 }));
}

// List of vendors with their payable balance.
async function vendorLedgers() {
  const [vendors, balances] = await Promise.all([
    Vendor.find().sort({ name: 1 }).lean(),
    journalService.balancesByRef(ACCOUNT.AP),
  ]);
  return vendors.map((v) => ({ ...v, balance: balances.get(String(v._id)) || 0 }));
}

// List of labourers with their payable balance (rent charged on sales that
// hasn't been paid out yet).
async function labourLedgers() {
  const [labourers, balances] = await Promise.all([
    Labour.find().sort({ name: 1 }).lean(),
    journalService.balancesByRef(ACCOUNT.AP_LABOUR),
  ]);
  return labourers.map((l) => ({ ...l, balance: balances.get(String(l._id)) || 0 }));
}

// Statement for one customer (AR), vendor (AP), or labourer (AP_LABOUR),
// optionally scoped to one store's transactions with them (their overall
// balance shown alongside stays business-wide — see customerLedgers/
// vendorLedgers/labourLedgers — only this drill-down statement narrows).
async function partyStatement(kind, id, { store, ...range } = {}) {
  let party;
  let account;
  if (kind === 'customer') {
    party = await Customer.findById(id);
    account = ACCOUNT.AR;
  } else if (kind === 'vendor') {
    party = await Vendor.findById(id);
    account = ACCOUNT.AP;
  } else if (kind === 'labour') {
    party = await Labour.findById(id);
    account = ACCOUNT.AP_LABOUR;
  } else {
    throw ApiError.badRequest("Ledger kind must be 'customer', 'vendor', or 'labour'");
  }
  if (!party) throw ApiError.notFound(`${kind} not found`);

  const statement = await journalService.accountStatement(account, party._id, {
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
  const bank = await BankAccount.findById(id);
  if (!bank) throw ApiError.notFound('Bank account not found');
  const statement = await journalService.accountStatement(ACCOUNT.BANK, bank._id, {
    ...parseRange(range),
    store: validStore(store),
  });
  return { bank, ...statement };
}

module.exports = {
  customerLedgers,
  vendorLedgers,
  labourLedgers,
  partyStatement,
  cashLedger,
  bankLedger,
};
