const BankAccount = require("../models/bankAccountModel");
const ApiError = require("../utils/ApiError");
const { toPaisa } = require("../utils/money");
const { ACCOUNT, REF } = require("../utils/finance");
const journalService = require("./journalService");

/**
 * Bank account management. Balances are derived from the BANK journal lines
 * that reference each account, never stored. An opening balance is posted as
 * an OPENING entry (Dr Bank / Cr Equity) so the books start in balance.
 */

async function listBankAccounts() {
  const accounts = await BankAccount.find().sort({ createdAt: 1 }).lean();
  // Attach each account's derived balance (paisa).
  return Promise.all(
    accounts.map(async (a) => ({
      ...a,
      balance: await journalService.accountBalance(ACCOUNT.BANK, a._id),
    }))
  );
}

async function getBankAccountById(id) {
  const account = await BankAccount.findById(id);
  if (!account) throw ApiError.notFound("Bank account not found");
  return account;
}

async function createBankAccount(actor, { name, bankName, accountNumber, openingBalance = 0 }) {
  const account = await BankAccount.create({ name, bankName, accountNumber });

  const opening = toPaisa(openingBalance);
  if (opening > 0) {
    await journalService.post({
      description: `Opening balance: ${name}`,
      refType: REF.OPENING,
      refId: account._id,
      createdBy: actor ? actor._id : null,
      lines: [
        journalService.line(ACCOUNT.BANK, { debit: opening, ref: account._id }),
        journalService.line(ACCOUNT.EQUITY, { credit: opening }),
      ],
    });
  }
  return account;
}

async function updateBankAccount(id, { name, bankName, accountNumber, isActive }) {
  const account = await getBankAccountById(id);
  if (name !== undefined) account.name = name;
  if (bankName !== undefined) account.bankName = bankName;
  if (accountNumber !== undefined) account.accountNumber = accountNumber;
  if (isActive !== undefined) account.isActive = isActive;
  await account.save();
  return account;
}

async function deleteBankAccount(id) {
  const account = await getBankAccountById(id);
  const balance = await journalService.accountBalance(ACCOUNT.BANK, id);
  if (balance !== 0) throw ApiError.badRequest("Bank account has a non-zero balance and cannot be deleted");
  await account.deleteOne();
}

module.exports = {
  listBankAccounts,
  getBankAccountById,
  createBankAccount,
  updateBankAccount,
  deleteBankAccount,
};
