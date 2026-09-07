const { getPostgres } = require('../db/postgres');
const { initializeModels } = require('../db/models');
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
  const { BankAccount } = initializeModels();
  const restricted = actorStoreId(actor);
  const effectiveStore = restricted || store;
  const where = effectiveStore ? { store: effectiveStore } : {};
  const accounts = await BankAccount.findAll({ where, order: [['createdAt', 'ASC']] });
  // Attach each account's derived balance (paisa).
  return Promise.all(
    accounts.map(async (a) => ({
      ...a.toJSON(),
      balance: await journalService.accountBalance(ACCOUNT.BANK, a.id),
    })),
  );
}

async function getBankAccountById(id) {
  const { BankAccount } = initializeModels();
  const account = await BankAccount.findByPk(id);
  if (!account) throw ApiError.notFound('Bank account not found');
  return account;
}

async function createBankAccount(
  actor,
  { name, bankName, accountNumber, store, openingBalance = 0 },
) {
  const { Store, BankAccount } = initializeModels();
  return getPostgres().transaction(async (transaction) => {
    const storeDoc = await Store.findByPk(store, { transaction });
    if (!storeDoc) throw ApiError.badRequest('A store is required');
    assertStoreAccess(actor, storeDoc.id);

    const account = await BankAccount.create(
      { name, bankName, accountNumber, store: storeDoc.id },
      { transaction },
    );

    const opening = toPaisa(openingBalance);
    if (opening > 0) {
      await journalService.post({
        description: `Opening balance: ${name}`,
        refType: REF.OPENING,
        refId: account.id,
        store: storeDoc.id,
        createdBy: actor ? actor.id : null,
        transaction,
        lines: [
          journalService.line(ACCOUNT.BANK, { debit: opening, ref: account.id }),
          journalService.line(ACCOUNT.EQUITY, { credit: opening }),
        ],
      });
    }
    return account;
  });
}

async function updateBankAccount(actor, id, { name, bankName, accountNumber, store, isActive }) {
  const { Store } = initializeModels();
  const account = await getBankAccountById(id);
  if (account.store) assertStoreAccess(actor, account.store);
  if (store !== undefined) {
    const storeDoc = await Store.findByPk(store);
    if (!storeDoc) throw ApiError.badRequest('Store not found');
    assertStoreAccess(actor, storeDoc.id);
    account.store = storeDoc.id;
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
  const balance = await journalService.accountBalance(ACCOUNT.BANK, account.id);
  if (balance !== 0)
    throw ApiError.badRequest('Bank account has a non-zero balance and cannot be deleted');
  await account.destroy();
}

module.exports = {
  listBankAccounts,
  getBankAccountById,
  createBankAccount,
  updateBankAccount,
  deleteBankAccount,
};
