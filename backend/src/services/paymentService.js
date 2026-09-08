const { initializeModels } = require('../db/models');
const { getPostgres } = require('../db/postgres');
const ApiError = require('../utils/ApiError');
const { toPaisa, toRupees } = require('../utils/money');
const { ACCOUNT, REF, PAYMENT_METHOD, BANK_METHODS } = require('../utils/finance');
const journalService = require('./journalService');
const counterService = require('./counterService');
const { assertStoreAccess } = require('../utils/storeScope');
const { Vendor, Supplier, Labour, Transporter, Customer, BankAccount, Store } = initializeModels();
const actorId = (actor) => actor && (actor.id || actor._id);
async function requireStore(actor, id, transaction) {
  const row = await Store.findByPk(id, {
    transaction,
    lock: transaction ? transaction.LOCK.UPDATE : undefined,
  });
  if (!row) throw ApiError.badRequest('A store is required');
  assertStoreAccess(actor, row.id);
  return row;
}
async function settlementAccount(method, bankAccountId, store, transaction = null) {
  if (BANK_METHODS.has(method)) {
    if (!bankAccountId) throw ApiError.badRequest('A bank account is required for this method');
    const bank = await BankAccount.findByPk(bankAccountId, {
      transaction,
      lock: transaction ? transaction.LOCK.UPDATE : undefined,
    });
    if (!bank) throw ApiError.notFound('Bank account not found');
    if (store && bank.store && bank.store !== store)
      throw ApiError.badRequest('That bank account does not belong to this store');
    return { account: ACCOUNT.BANK, ref: bank.id };
  }
  if (method === PAYMENT_METHOD.CASH) return { account: ACCOUNT.CASH, ref: null };
  throw ApiError.badRequest('Unsupported payment method');
}
async function assertSufficientFunds(account, ref, amount, options = {}) {
  const balance = await journalService.accountBalance(account, ref, options);
  if (balance < amount)
    throw ApiError.badRequest(
      `Insufficient funds in the ${account === ACCOUNT.BANK ? 'bank account' : 'cash drawer'}. Available: Rs ${toRupees(balance)}; required: Rs ${toRupees(amount)}`,
    );
}
async function transfer(actor, input, config) {
  const write = async (transaction) => {
    const store = await requireStore(actor, input.store, transaction);
    const party = await config.Model.findByPk(input[config.key], { transaction });
    if (!party) throw ApiError.notFound(config.label + ' not found');
    const amount = toPaisa(input.amount);
    if (amount <= 0) throw ApiError.badRequest('Amount must be positive');
    const outstanding = await journalService.accountBalance(config.account, party.id, {
      store: store.id,
      transaction,
    });
    if (amount > outstanding) {
      throw ApiError.badRequest(`Amount exceeds the outstanding balance for ${party.name}`);
    }
    const settle = await settlementAccount(
      input.method || PAYMENT_METHOD.CASH,
      input.bankAccount,
      store.id,
      transaction,
    );
    if (config.outgoing)
      await assertSufficientFunds(settle.account, settle.ref, amount, {
        store: store.id,
        transaction,
      });
    const when = input.date ? new Date(input.date) : new Date();
    const number = await counterService.nextDocNumber(
      config.outgoing ? 'PAY' : 'RCPT',
      when.getFullYear(),
      4,
      transaction,
    );
    const lines = config.outgoing
      ? [
          journalService.line(config.account, { debit: amount, ref: party.id }),
          journalService.line(settle.account, { credit: amount, ref: settle.ref }),
        ]
      : [
          journalService.line(settle.account, { debit: amount, ref: settle.ref }),
          journalService.line(config.account, { credit: amount, ref: party.id }),
        ];
    return journalService.post({
      date: when,
      description: input.note || `${config.outgoing ? 'Payment to' : 'Receipt from'} ${party.name}`,
      refType: config.outgoing ? REF.PAYMENT : REF.RECEIPT,
      refNo: number,
      store: store.id,
      createdBy: actorId(actor),
      lines,
      transaction,
    });
  };
  return input.transaction ? write(input.transaction) : getPostgres().transaction(write);
}
const payVendor = (actor, input) =>
  transfer(actor, input, {
    Model: Vendor,
    key: 'vendor',
    label: 'Vendor',
    account: ACCOUNT.AP,
    outgoing: true,
  });
const paySupplier = (actor, input) =>
  transfer(actor, input, {
    Model: Supplier,
    key: 'supplier',
    label: 'Supplier',
    account: ACCOUNT.AP_SUPPLIER,
    outgoing: true,
  });
const payLabour = (actor, input) =>
  transfer(actor, input, {
    Model: Labour,
    key: 'labour',
    label: 'Labourer',
    account: ACCOUNT.AP_LABOUR,
    outgoing: true,
  });
const payTransport = (actor, input) =>
  transfer(actor, input, {
    Model: Transporter,
    key: 'transporter',
    label: 'Transporter',
    account: ACCOUNT.AP_TRANSPORT,
    outgoing: true,
  });
const receiveFromCustomer = (actor, input) =>
  transfer(actor, input, {
    Model: Customer,
    key: 'customer',
    label: 'Customer',
    account: ACCOUNT.AR,
    outgoing: false,
  });
async function cashEntry(actor, input) {
  return getPostgres().transaction(async (transaction) => {
    const amount = toPaisa(input.amount);
    if (amount <= 0) throw ApiError.badRequest('Amount must be positive');
    if (!['IN', 'OUT'].includes(input.direction))
      throw ApiError.badRequest('Direction must be IN or OUT');
    const store = await requireStore(actor, input.store, transaction);
    if (input.direction === 'OUT')
      await assertSufficientFunds(ACCOUNT.CASH, null, amount, {
        store: store.id,
        transaction,
      });
    const incoming = input.direction === 'IN';
    return journalService.post({
      date: input.date ? new Date(input.date) : new Date(),
      description: input.note || (incoming ? 'Cash in' : 'Cash out'),
      refType: REF.CASH_ADJUST,
      store: store.id,
      createdBy: actorId(actor),
      lines: incoming
        ? [
            journalService.line(ACCOUNT.CASH, { debit: amount }),
            journalService.line(ACCOUNT.EQUITY, { credit: amount }),
          ]
        : [
            journalService.line(ACCOUNT.EQUITY, { debit: amount }),
            journalService.line(ACCOUNT.CASH, { credit: amount }),
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
  cashEntry,
  settlementAccount,
  assertSufficientFunds,
};
