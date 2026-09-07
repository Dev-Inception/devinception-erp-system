const Vendor = require('../models/vendorModel');
const Supplier = require('../models/supplierModel');
const Labour = require('../models/labourModel');
const Transporter = require('../models/transporterModel');
const Customer = require('../models/customerModel');
const BankAccount = require('../models/bankAccountModel');
const Store = require('../models/storeModel');
const ApiError = require('../utils/ApiError');
const { toPaisa, toRupees } = require('../utils/money');
const { ACCOUNT, REF, PAYMENT_METHOD, BANK_METHODS } = require('../utils/finance');
const journalService = require('./journalService');
const counterService = require('./counterService');
const { assertStoreAccess } = require('../utils/storeScope');

/**
 * Money movements that aren't sales or purchases: paying down a vendor's
 * payable, receiving against a customer's receivable, and manual cash
 * in/out entries. Each posts one balanced journal entry.
 */

// Every money movement here happens at one physical storefront's till —
// required so the Cash & Bank ledger can be scoped accurately per store.
async function requireStore(actor, store) {
  const storeDoc = await Store.findById(store);
  if (!storeDoc) throw ApiError.badRequest('A store is required');
  assertStoreAccess(actor, storeDoc._id);
  return storeDoc;
}

// Resolve the cash/bank account a payment leaves from or arrives into.
// `store`, when given, must match the chosen account's own store — a legacy
// account with no store assigned yet is exempt from that check so existing
// flows keep working until it's reassigned via the Cash & Bank page.
async function settlementAccount(method, bankAccountId, store) {
  if (BANK_METHODS.has(method)) {
    if (!bankAccountId) throw ApiError.badRequest('A bank account is required for this method');
    const bank = await BankAccount.findById(bankAccountId);
    if (!bank) throw ApiError.notFound('Bank account not found');
    if (store && bank.store && String(bank.store) !== String(store)) {
      throw ApiError.badRequest('That bank account does not belong to this store');
    }
    return { account: ACCOUNT.BANK, ref: bank._id };
  }
  if (method === PAYMENT_METHOD.CASH) return { account: ACCOUNT.CASH, ref: null };
  throw ApiError.badRequest('Unsupported payment method');
}

// Refuse to move more money out of a cash/bank account than it holds, so the
// drawer or bank balance can't be driven negative. (No DB transaction here —
// matches the rest of the standalone-Mongo flows — but it stops the obvious
// overdraft.)
async function assertSufficientFunds(account, ref, amount) {
  const balance = await journalService.accountBalance(account, ref);
  if (balance < amount) {
    const where = account === ACCOUNT.BANK ? 'bank account' : 'cash drawer';
    throw ApiError.badRequest(
      `Insufficient funds in the ${where}. Available: Rs ${toRupees(balance)}; required: Rs ${toRupees(amount)}`,
    );
  }
}

// Pay a vendor: Dr Accounts-Payable (vendor) / Cr Cash|Bank.
async function payVendor(
  actor,
  { vendor, store, amount, method = PAYMENT_METHOD.CASH, bankAccount, date, note },
) {
  const vendorDoc = await Vendor.findById(vendor);
  if (!vendorDoc) throw ApiError.notFound('Vendor not found');
  const storeDoc = await requireStore(actor, store);

  const amt = toPaisa(amount);
  if (amt <= 0) throw ApiError.badRequest('Amount must be positive');

  const settle = await settlementAccount(method, bankAccount, storeDoc._id);
  await assertSufficientFunds(settle.account, settle.ref, amt);
  const when = date ? new Date(date) : new Date();
  const number = await counterService.nextDocNumber('PAY', when.getFullYear(), 4);

  return journalService.post({
    date: when,
    description: note || `Payment to ${vendorDoc.name}`,
    refType: REF.PAYMENT,
    refNo: number,
    store: storeDoc._id,
    createdBy: actor ? actor._id : null,
    lines: [
      journalService.line(ACCOUNT.AP, { debit: amt, ref: vendorDoc._id }),
      journalService.line(settle.account, { credit: amt, ref: settle.ref }),
    ],
  });
}

// Pay a supplier: Dr AP_SUPPLIER (supplier) / Cr Cash|Bank.
async function paySupplier(
  actor,
  { supplier, store, amount, method = PAYMENT_METHOD.CASH, bankAccount, date, note },
) {
  const supplierDoc = await Supplier.findById(supplier);
  if (!supplierDoc) throw ApiError.notFound('Supplier not found');
  const storeDoc = await requireStore(actor, store);

  const amt = toPaisa(amount);
  if (amt <= 0) throw ApiError.badRequest('Amount must be positive');

  const settle = await settlementAccount(method, bankAccount, storeDoc._id);
  await assertSufficientFunds(settle.account, settle.ref, amt);
  const when = date ? new Date(date) : new Date();
  const number = await counterService.nextDocNumber('PAY', when.getFullYear(), 4);

  return journalService.post({
    date: when,
    description: note || `Payment to ${supplierDoc.name}`,
    refType: REF.PAYMENT,
    refNo: number,
    store: storeDoc._id,
    createdBy: actor ? actor._id : null,
    lines: [
      journalService.line(ACCOUNT.AP_SUPPLIER, { debit: amt, ref: supplierDoc._id }),
      journalService.line(settle.account, { credit: amt, ref: settle.ref }),
    ],
  });
}

// Pay a labourer: Dr AP_LABOUR (labourer) / Cr Cash|Bank.
async function payLabour(
  actor,
  { labour, store, amount, method = PAYMENT_METHOD.CASH, bankAccount, date, note },
) {
  const labourDoc = await Labour.findById(labour);
  if (!labourDoc) throw ApiError.notFound('Labourer not found');
  const storeDoc = await requireStore(actor, store);

  const amt = toPaisa(amount);
  if (amt <= 0) throw ApiError.badRequest('Amount must be positive');

  const settle = await settlementAccount(method, bankAccount, storeDoc._id);
  await assertSufficientFunds(settle.account, settle.ref, amt);
  const when = date ? new Date(date) : new Date();
  const number = await counterService.nextDocNumber('PAY', when.getFullYear(), 4);

  return journalService.post({
    date: when,
    description: note || `Payment to ${labourDoc.name}`,
    refType: REF.PAYMENT,
    refNo: number,
    store: storeDoc._id,
    createdBy: actor ? actor._id : null,
    lines: [
      journalService.line(ACCOUNT.AP_LABOUR, { debit: amt, ref: labourDoc._id }),
      journalService.line(settle.account, { credit: amt, ref: settle.ref }),
    ],
  });
}

// Pay a transporter: Dr AP_TRANSPORT (transporter) / Cr Cash|Bank.
async function payTransport(
  actor,
  { transporter, store, amount, method = PAYMENT_METHOD.CASH, bankAccount, date, note },
) {
  const transporterDoc = await Transporter.findById(transporter);
  if (!transporterDoc) throw ApiError.notFound('Transporter not found');
  const storeDoc = await requireStore(actor, store);

  const amt = toPaisa(amount);
  if (amt <= 0) throw ApiError.badRequest('Amount must be positive');

  const settle = await settlementAccount(method, bankAccount, storeDoc._id);
  await assertSufficientFunds(settle.account, settle.ref, amt);
  const when = date ? new Date(date) : new Date();
  const number = await counterService.nextDocNumber('PAY', when.getFullYear(), 4);

  return journalService.post({
    date: when,
    description: note || `Payment to ${transporterDoc.name}`,
    refType: REF.PAYMENT,
    refNo: number,
    store: storeDoc._id,
    createdBy: actor ? actor._id : null,
    lines: [
      journalService.line(ACCOUNT.AP_TRANSPORT, { debit: amt, ref: transporterDoc._id }),
      journalService.line(settle.account, { credit: amt, ref: settle.ref }),
    ],
  });
}

// Receive from a customer: Dr Cash|Bank / Cr Accounts-Receivable (customer).
async function receiveFromCustomer(
  actor,
  { customer, store, amount, method = PAYMENT_METHOD.CASH, bankAccount, date, note },
) {
  const customerDoc = await Customer.findById(customer);
  if (!customerDoc) throw ApiError.notFound('Customer not found');
  const storeDoc = await requireStore(actor, store);

  const amt = toPaisa(amount);
  if (amt <= 0) throw ApiError.badRequest('Amount must be positive');

  const settle = await settlementAccount(method, bankAccount, storeDoc._id);
  const when = date ? new Date(date) : new Date();
  const number = await counterService.nextDocNumber('RCPT', when.getFullYear(), 4);

  return journalService.post({
    date: when,
    description: note || `Receipt from ${customerDoc.name}`,
    refType: REF.RECEIPT,
    refNo: number,
    store: storeDoc._id,
    createdBy: actor ? actor._id : null,
    lines: [
      journalService.line(settle.account, { debit: amt, ref: settle.ref }),
      journalService.line(ACCOUNT.AR, { credit: amt, ref: customerDoc._id }),
    ],
  });
}

/**
 * Manual cash entry. `direction` is "IN" (cash added to the drawer) or "OUT"
 * (cash removed). The other side is equity, so the books stay balanced.
 */
async function cashEntry(actor, { direction, store, amount, date, note }) {
  const amt = toPaisa(amount);
  if (amt <= 0) throw ApiError.badRequest('Amount must be positive');
  if (direction !== 'IN' && direction !== 'OUT') {
    throw ApiError.badRequest('Direction must be IN or OUT');
  }
  const storeDoc = await requireStore(actor, store);
  // Taking cash out can't drive the drawer negative.
  if (direction === 'OUT') await assertSufficientFunds(ACCOUNT.CASH, null, amt);
  const when = date ? new Date(date) : new Date();

  const lines =
    direction === 'IN'
      ? [
          journalService.line(ACCOUNT.CASH, { debit: amt }),
          journalService.line(ACCOUNT.EQUITY, { credit: amt }),
        ]
      : [
          journalService.line(ACCOUNT.EQUITY, { debit: amt }),
          journalService.line(ACCOUNT.CASH, { credit: amt }),
        ];

  return journalService.post({
    date: when,
    description: note || (direction === 'IN' ? 'Cash in' : 'Cash out'),
    refType: REF.CASH_ADJUST,
    store: storeDoc._id,
    createdBy: actor ? actor._id : null,
    lines,
  });
}

// Record an operating expense: Dr Operating Expense / Cr Cash|Bank. A
// warehouse is attached to the journal entry so warehouse-scoped P&L reports
// include only expenses attributable to that location, and a store so the
// Cash & Bank ledger can be scoped per storefront.
async function recordExpense(
  actor,
  { warehouse, store, amount, method = PAYMENT_METHOD.CASH, bankAccount, date, note },
) {
  const wh = warehouse
    ? await require('./warehouseService').getWarehouseById(warehouse)
    : await require('./stockService').ensureDefaultWarehouse();
  const storeDoc = await requireStore(actor, store);
  const amt = toPaisa(amount);
  if (amt <= 0) throw ApiError.badRequest('Amount must be positive');

  const settle = await settlementAccount(method, bankAccount, storeDoc._id);
  await assertSufficientFunds(settle.account, settle.ref, amt);
  const when = date ? new Date(date) : new Date();
  const number = await counterService.nextDocNumber('EXP', when.getFullYear(), 6);

  return journalService.post({
    date: when,
    description: note || `Operating expense ${number}`,
    refType: REF.EXPENSE,
    refNo: number,
    warehouse: wh._id,
    store: storeDoc._id,
    createdBy: actor ? actor._id : null,
    lines: [
      journalService.line(ACCOUNT.OPERATING_EXPENSE, { debit: amt }),
      journalService.line(settle.account, { credit: amt, ref: settle.ref }),
    ],
  });
}

module.exports = {
  payVendor,
  paySupplier,
  payLabour,
  payTransport,
  receiveFromCustomer,
  cashEntry,
  recordExpense,
  settlementAccount,
  assertSufficientFunds,
};
