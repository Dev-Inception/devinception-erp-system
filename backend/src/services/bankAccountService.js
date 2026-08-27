const BankAccount = require('../models/bankAccountModel');
const Store = require('../models/storeModel');
const ApiError = require('../utils/ApiError');
const { toPaisa } = require('../utils/money');
const { ACCOUNT, REF } = require('../utils/finance');
const journalService = require('./journalService');
const { assertStoreAccess, actorStoreId } = require('../utils/storeScope');

/**
 * Bank account management. Balances are derived from the BANK journal lines
 * that reference each account, never stored. An opening balance is posted as
 * an OPENING entry (Dr Bank / Cr Equity) so the books start in balance.
 *
 * Every account belongs to exactly one store — different storefronts can
 * (and typically do) settle into different bank accounts.
 */

// `store` filters to one storefront's accounts; omitted/invalid lists every
// account (including legacy ones with no store yet), matching how other
// list endpoints degrade to "everything" — except for a store-restricted
// actor, whose own store always wins.
async function listBankAccounts({ store, actor } = {}) {
  const restricted = actorStoreId(actor);
  const effectiveStore = restricted || store;
  const filter = effectiveStore ? { store: effectiveStore } : {};
  const accounts = await BankAccount.find(filter).sort({ createdAt: 1 }).lean();
  // Attach each account's derived balance (paisa).
  return Promise.all(
    accounts.map(async (a) => ({
      ...a,
      balance: await journalService.accountBalance(ACCOUNT.BANK, a._id),
    })),
  );
}

async function getBankAccountById(id) {
  const account = await BankAccount.findById(id);
  if (!account) throw ApiError.notFound('Bank account not found');
  return account;
}

async function createBankAccount(
  actor,
  { name, bankName, accountNumber, store, openingBalance = 0 },
) {
  const storeDoc = await Store.findById(store);
  if (!storeDoc) throw ApiError.badRequest('A store is required');
  assertStoreAccess(actor, storeDoc._id);

  const account = await BankAccount.create({ name, bankName, accountNumber, store: storeDoc._id });

  const opening = toPaisa(openingBalance);
  if (opening > 0) {
    await journalService.post({
      description: `Opening balance: ${name}`,
      refType: REF.OPENING,
      refId: account._id,
      store: storeDoc._id,
      createdBy: actor ? actor._id : null,
      lines: [
        journalService.line(ACCOUNT.BANK, { debit: opening, ref: account._id }),
        journalService.line(ACCOUNT.EQUITY, { credit: opening }),
      ],
    });
  }
  return account;
}

async function updateBankAccount(actor, id, { name, bankName, accountNumber, store, isActive }) {
  const account = await getBankAccountById(id);
  if (account.store) assertStoreAccess(actor, account.store);
  if (store !== undefined) {
    const storeDoc = await Store.findById(store);
    if (!storeDoc) throw ApiError.badRequest('Store not found');
    assertStoreAccess(actor, storeDoc._id);
    account.store = storeDoc._id;
  }
  if (name !== undefined) account.name = name;
  if (bankName !== undefined) account.bankName = bankName;
  if (accountNumber !== undefined) account.accountNumber = accountNumber;
  if (isActive !== undefined) account.isActive = isActive;
  await account.save();
  return account;
}

async function deleteBankAccount(id) {
  const account = await getBankAccountById(id);
  const balance = await journalService.accountBalance(ACCOUNT.BANK, account._id);
  if (balance !== 0)
    throw ApiError.badRequest('Bank account has a non-zero balance and cannot be deleted');
  await account.deleteOne();
}

module.exports = {
  listBankAccounts,
  getBankAccountById,
  createBankAccount,
  updateBankAccount,
  deleteBankAccount,
};
