const Customer = require('../models/customerModel');
const Vendor = require('../models/vendorModel');
const BankAccount = require('../models/bankAccountModel');
const ApiError = require('../utils/ApiError');
const { ACCOUNT } = require('../utils/finance');
const journalService = require('./journalService');

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

// Statement for one customer (AR) or vendor (AP).
async function partyStatement(kind, id, range) {
  let party;
  let account;
  if (kind === 'customer') {
    party = await Customer.findById(id);
    account = ACCOUNT.AR;
  } else if (kind === 'vendor') {
    party = await Vendor.findById(id);
    account = ACCOUNT.AP;
  } else {
    throw ApiError.badRequest("Ledger kind must be 'customer' or 'vendor'");
  }
  if (!party) throw ApiError.notFound(`${kind} not found`);

  const statement = await journalService.accountStatement(account, party._id, parseRange(range));
  return { party, ...statement };
}

// Cash book (the singleton CASH account).
async function cashLedger(range) {
  return journalService.accountStatement(ACCOUNT.CASH, null, parseRange(range));
}

// Statement for one bank account.
async function bankLedger(id, range) {
  const bank = await BankAccount.findById(id);
  if (!bank) throw ApiError.notFound('Bank account not found');
  const statement = await journalService.accountStatement(
    ACCOUNT.BANK,
    bank._id,
    parseRange(range),
  );
  return { bank, ...statement };
}

module.exports = {
  customerLedgers,
  vendorLedgers,
  partyStatement,
  cashLedger,
  bankLedger,
};
