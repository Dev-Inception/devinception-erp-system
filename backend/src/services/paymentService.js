const { getPostgres } = require('../db/postgres');
const { initializeModels } = require('../db/models');
const ApiError = require('../utils/ApiError');
const { toPaisa } = require('../utils/money');
const { ACCOUNT, REF, PAYMENT_METHOD, BANK_METHODS } = require('../utils/finance');
const journalService = require('./journalService');
const counterService = require('./counterService');
const { assertStoreAccess } = require('../utils/storeScope');

/**
 * Money movements that aren't sales or purchases: paying down a vendor's
 * payable, receiving against a customer's receivable, and manual cash
 * in/out entries. Each posts one balanced journal entry inside its own
 * transaction.
 */

// Every money movement here happens at one physical storefront's till —
// required so the Cash & Bank ledger can be scoped accurately per store.
async function requireStore(actor, store, transaction) {
  const { Store } = initializeModels();
  const storeDoc = await Store.findByPk(store, { transaction });
  if (!storeDoc) throw ApiError.badRequest('A store is required');
  assertStoreAccess(actor, storeDoc.id);
  return storeDoc;
}

// Resolve the cash/bank account a payment leaves from or arrives into.
// `store`, when given, must match the chosen account's own store — a legacy
// account with no store assigned yet is exempt from that check so existing
// flows keep working until it's reassigned via the Cash & Bank page.
async function settlementAccount(method, bankAccountId, store, transaction) {
  const { BankAccount } = initializeModels();
  if (BANK_METHODS.has(method)) {
    if (!bankAccountId) throw ApiError.badRequest('A bank account is required for this method');
    const bank = await BankAccount.findByPk(bankAccountId, { transaction });
    if (!bank) throw ApiError.notFound('Bank account not found');
    if (store && bank.store && String(bank.store) !== String(store)) {
      throw ApiError.badRequest('That bank account does not belong to this store');
    }
    return { account: ACCOUNT.BANK, ref: bank.id };
  }
  if (method === PAYMENT_METHOD.CASH) return { account: ACCOUNT.CASH, ref: null };
  throw ApiError.badRequest('Unsupported payment method');
}

// Pay a vendor: Dr Accounts-Payable (vendor) / Cr Cash|Bank.
async function payVendor(
  actor,
  { vendor, store, amount, method = PAYMENT_METHOD.CASH, bankAccount, date, note },
) {
  const { Vendor } = initializeModels();
  return getPostgres().transaction(async (transaction) => {
    const vendorDoc = await Vendor.findByPk(vendor, { transaction });
    if (!vendorDoc) throw ApiError.notFound('Vendor not found');
    const storeDoc = await requireStore(actor, store, transaction);

    const amt = toPaisa(amount);
    if (amt <= 0) throw ApiError.badRequest('Amount must be positive');

    const settle = await settlementAccount(method, bankAccount, storeDoc.id, transaction);
    const when = date ? new Date(date) : new Date();
    const number = await counterService.nextDocNumber('PAY', when.getFullYear(), 4, transaction);

    return journalService.post({
      date: when,
      description: note || `Payment to ${vendorDoc.name}`,
      refType: REF.PAYMENT,
      refNo: number,
      store: storeDoc.id,
      createdBy: actor ? actor.id : null,
      lines: [
        journalService.line(ACCOUNT.AP, { debit: amt, ref: vendorDoc.id }),
        journalService.line(settle.account, { credit: amt, ref: settle.ref }),
      ],
      transaction,
    });
  });
}

// Pay a supplier: Dr AP_SUPPLIER (supplier) / Cr Cash|Bank.
async function paySupplier(
  actor,
  { supplier, store, amount, method = PAYMENT_METHOD.CASH, bankAccount, date, note },
) {
  const { Supplier } = initializeModels();
  return getPostgres().transaction(async (transaction) => {
    const supplierDoc = await Supplier.findByPk(supplier, { transaction });
    if (!supplierDoc) throw ApiError.notFound('Supplier not found');
    const storeDoc = await requireStore(actor, store, transaction);

    const amt = toPaisa(amount);
    if (amt <= 0) throw ApiError.badRequest('Amount must be positive');

    const settle = await settlementAccount(method, bankAccount, storeDoc.id, transaction);
    const when = date ? new Date(date) : new Date();
    const number = await counterService.nextDocNumber('PAY', when.getFullYear(), 4, transaction);

    return journalService.post({
      date: when,
      description: note || `Payment to ${supplierDoc.name}`,
      refType: REF.PAYMENT,
      refNo: number,
      store: storeDoc.id,
      createdBy: actor ? actor.id : null,
      lines: [
        journalService.line(ACCOUNT.AP_SUPPLIER, { debit: amt, ref: supplierDoc.id }),
        journalService.line(settle.account, { credit: amt, ref: settle.ref }),
      ],
      transaction,
    });
  });
}

// Pay a labourer: Dr AP_LABOUR (labourer) / Cr Cash|Bank.
async function payLabour(
  actor,
  { labour, store, amount, method = PAYMENT_METHOD.CASH, bankAccount, date, note },
) {
  const { Labour } = initializeModels();
  return getPostgres().transaction(async (transaction) => {
    const labourDoc = await Labour.findByPk(labour, { transaction });
    if (!labourDoc) throw ApiError.notFound('Labourer not found');
    const storeDoc = await requireStore(actor, store, transaction);

    const amt = toPaisa(amount);
    if (amt <= 0) throw ApiError.badRequest('Amount must be positive');

    const settle = await settlementAccount(method, bankAccount, storeDoc.id, transaction);
    const when = date ? new Date(date) : new Date();
    const number = await counterService.nextDocNumber('PAY', when.getFullYear(), 4, transaction);

    return journalService.post({
      date: when,
      description: note || `Payment to ${labourDoc.name}`,
      refType: REF.PAYMENT,
      refNo: number,
      store: storeDoc.id,
      createdBy: actor ? actor.id : null,
      lines: [
        journalService.line(ACCOUNT.AP_LABOUR, { debit: amt, ref: labourDoc.id }),
        journalService.line(settle.account, { credit: amt, ref: settle.ref }),
      ],
      transaction,
    });
  });
}

// Pay a transporter: Dr AP_TRANSPORT (transporter) / Cr Cash|Bank.
async function payTransport(
  actor,
  { transporter, store, amount, method = PAYMENT_METHOD.CASH, bankAccount, date, note },
) {
  const { Transporter } = initializeModels();
  return getPostgres().transaction(async (transaction) => {
    const transporterDoc = await Transporter.findByPk(transporter, { transaction });
    if (!transporterDoc) throw ApiError.notFound('Transporter not found');
    const storeDoc = await requireStore(actor, store, transaction);

    const amt = toPaisa(amount);
    if (amt <= 0) throw ApiError.badRequest('Amount must be positive');

    const settle = await settlementAccount(method, bankAccount, storeDoc.id, transaction);
    const when = date ? new Date(date) : new Date();
    const number = await counterService.nextDocNumber('PAY', when.getFullYear(), 4, transaction);

    return journalService.post({
      date: when,
      description: note || `Payment to ${transporterDoc.name}`,
      refType: REF.PAYMENT,
      refNo: number,
      store: storeDoc.id,
      createdBy: actor ? actor.id : null,
      lines: [
        journalService.line(ACCOUNT.AP_TRANSPORT, { debit: amt, ref: transporterDoc.id }),
        journalService.line(settle.account, { credit: amt, ref: settle.ref }),
      ],
      transaction,
    });
  });
}

// Receive from a customer: Dr Cash|Bank / Cr Accounts-Receivable (customer).
async function receiveFromCustomer(
  actor,
  { customer, store, amount, method = PAYMENT_METHOD.CASH, bankAccount, date, note },
) {
  const { Customer } = initializeModels();
  return getPostgres().transaction(async (transaction) => {
    const customerDoc = await Customer.findByPk(customer, { transaction });
    if (!customerDoc) throw ApiError.notFound('Customer not found');
    const storeDoc = await requireStore(actor, store, transaction);

    const amt = toPaisa(amount);
    if (amt <= 0) throw ApiError.badRequest('Amount must be positive');

    const settle = await settlementAccount(method, bankAccount, storeDoc.id, transaction);
    const when = date ? new Date(date) : new Date();
    const number = await counterService.nextDocNumber('RCPT', when.getFullYear(), 4, transaction);

    return journalService.post({
      date: when,
      description: note || `Receipt from ${customerDoc.name}`,
      refType: REF.RECEIPT,
      refNo: number,
      store: storeDoc.id,
      createdBy: actor ? actor.id : null,
      lines: [
        journalService.line(settle.account, { debit: amt, ref: settle.ref }),
        journalService.line(ACCOUNT.AR, { credit: amt, ref: customerDoc.id }),
      ],
      transaction,
    });
  });
}

// Receive from a vendor who bought stock from us: Dr Cash|Bank / Cr
// Vendor-Receivable (vendor). The counterpart of receiveFromCustomer, but
// against ACCOUNT.AR_VENDOR — independent of whatever we may separately owe
// that same vendor on the AP side. Payment IN on the vendor-sale ledger.
async function receiveFromVendorReceivable(
  actor,
  { vendor, store, amount, method = PAYMENT_METHOD.CASH, bankAccount, date, note },
) {
  const { Vendor } = initializeModels();
  return getPostgres().transaction(async (transaction) => {
    const vendorDoc = await Vendor.findByPk(vendor, { transaction });
    if (!vendorDoc) throw ApiError.notFound('Vendor not found');
    const storeDoc = await requireStore(actor, store, transaction);

    const amt = toPaisa(amount);
    if (amt <= 0) throw ApiError.badRequest('Amount must be positive');

    const settle = await settlementAccount(method, bankAccount, storeDoc.id, transaction);
    const when = date ? new Date(date) : new Date();
    const number = await counterService.nextDocNumber('RCPT', when.getFullYear(), 4, transaction);

    return journalService.post({
      date: when,
      description: note || `Receipt from ${vendorDoc.name}`,
      refType: REF.RECEIPT,
      refNo: number,
      store: storeDoc.id,
      createdBy: actor ? actor.id : null,
      lines: [
        journalService.line(settle.account, { debit: amt, ref: settle.ref }),
        journalService.line(ACCOUNT.AR_VENDOR, { credit: amt, ref: vendorDoc.id }),
      ],
      transaction,
    });
  });
}

// Refund a vendor who bought stock from us: Dr Vendor-Receivable (vendor) /
// Cr Cash|Bank — e.g. an overpayment or a goodwill refund. Payment OUT on
// the vendor-sale ledger, distinct from payVendor (which settles the AP
// side of the same vendor).
async function refundVendorReceivable(
  actor,
  { vendor, store, amount, method = PAYMENT_METHOD.CASH, bankAccount, date, note },
) {
  const { Vendor } = initializeModels();
  return getPostgres().transaction(async (transaction) => {
    const vendorDoc = await Vendor.findByPk(vendor, { transaction });
    if (!vendorDoc) throw ApiError.notFound('Vendor not found');
    const storeDoc = await requireStore(actor, store, transaction);

    const amt = toPaisa(amount);
    if (amt <= 0) throw ApiError.badRequest('Amount must be positive');

    const settle = await settlementAccount(method, bankAccount, storeDoc.id, transaction);
    const when = date ? new Date(date) : new Date();
    const number = await counterService.nextDocNumber('PAY', when.getFullYear(), 4, transaction);

    return journalService.post({
      date: when,
      description: note || `Refund to ${vendorDoc.name}`,
      refType: REF.PAYMENT,
      refNo: number,
      store: storeDoc.id,
      createdBy: actor ? actor.id : null,
      lines: [
        journalService.line(ACCOUNT.AR_VENDOR, { debit: amt, ref: vendorDoc.id }),
        journalService.line(settle.account, { credit: amt, ref: settle.ref }),
      ],
      transaction,
    });
  });
}

/**
 * Manual cash entry. `direction` is "IN" (cash added to the drawer) or "OUT"
 * (cash removed). The other side is equity, so the books stay balanced.
 */
async function cashEntry(actor, { direction, store, amount, date, note }) {
  return getPostgres().transaction(async (transaction) => {
    const amt = toPaisa(amount);
    if (amt <= 0) throw ApiError.badRequest('Amount must be positive');
    if (direction !== 'IN' && direction !== 'OUT') {
      throw ApiError.badRequest('Direction must be IN or OUT');
    }
    const storeDoc = await requireStore(actor, store, transaction);
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
      store: storeDoc.id,
      createdBy: actor ? actor.id : null,
      lines,
      transaction,
    });
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
  return getPostgres().transaction(async (transaction) => {
    const wh = warehouse
      ? await require('./warehouseService').getWarehouseById(warehouse, transaction)
      : await require('./stockService').ensureDefaultWarehouse(transaction);
    const storeDoc = await requireStore(actor, store, transaction);
    const amt = toPaisa(amount);
    if (amt <= 0) throw ApiError.badRequest('Amount must be positive');

    const settle = await settlementAccount(method, bankAccount, storeDoc.id, transaction);
    const when = date ? new Date(date) : new Date();
    const number = await counterService.nextDocNumber('EXP', when.getFullYear(), 6, transaction);

    return journalService.post({
      date: when,
      description: note || `Operating expense ${number}`,
      refType: REF.EXPENSE,
      refNo: number,
      warehouse: wh.id,
      store: storeDoc.id,
      createdBy: actor ? actor.id : null,
      lines: [
        journalService.line(ACCOUNT.OPERATING_EXPENSE, { debit: amt }),
        journalService.line(settle.account, { credit: amt, ref: settle.ref }),
      ],
      transaction,
    });
  });
}

module.exports = {
  payVendor,
  paySupplier,
  payLabour,
  payTransport,
  receiveFromCustomer,
  receiveFromVendorReceivable,
  refundVendorReceivable,
  cashEntry,
  recordExpense,
  settlementAccount,
};
