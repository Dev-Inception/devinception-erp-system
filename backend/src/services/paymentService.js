const Vendor = require("../models/vendorModel");
const Customer = require("../models/customerModel");
const BankAccount = require("../models/bankAccountModel");
const ApiError = require("../utils/ApiError");
const { toPaisa } = require("../utils/money");
const { ACCOUNT, REF, PAYMENT_METHOD, BANK_METHODS } = require("../utils/finance");
const journalService = require("./journalService");
const counterService = require("./counterService");

/**
 * Money movements that aren't sales or purchases: paying down a vendor's
 * payable, receiving against a customer's receivable, and manual cash
 * in/out entries. Each posts one balanced journal entry.
 */

// Resolve the cash/bank account a payment leaves from or arrives into.
async function settlementAccount(method, bankAccountId) {
  if (BANK_METHODS.has(method)) {
    if (!bankAccountId) throw ApiError.badRequest("A bank account is required for this method");
    const bank = await BankAccount.findById(bankAccountId);
    if (!bank) throw ApiError.notFound("Bank account not found");
    return { account: ACCOUNT.BANK, ref: bank._id };
  }
  if (method === PAYMENT_METHOD.CASH) return { account: ACCOUNT.CASH, ref: null };
  throw ApiError.badRequest("Unsupported payment method");
}

// Refuse to move more money out of a cash/bank account than it holds, so the
// drawer or bank balance can't be driven negative. (No DB transaction here —
// matches the rest of the standalone-Mongo flows — but it stops the obvious
// overdraft.)
async function assertSufficientFunds(account, ref, amount) {
  const balance = await journalService.accountBalance(account, ref);
  if (balance < amount) {
    const where = account === ACCOUNT.BANK ? "bank account" : "cash drawer";
    throw ApiError.badRequest(`Insufficient funds in the ${where} for this payment`);
  }
}

// Pay a vendor: Dr Accounts-Payable (vendor) / Cr Cash|Bank.
async function payVendor(actor, { vendor, amount, method = PAYMENT_METHOD.CASH, bankAccount, date, note }) {
  const vendorDoc = await Vendor.findById(vendor);
  if (!vendorDoc) throw ApiError.notFound("Vendor not found");

  const amt = toPaisa(amount);
  if (amt <= 0) throw ApiError.badRequest("Amount must be positive");

  const settle = await settlementAccount(method, bankAccount);
  await assertSufficientFunds(settle.account, settle.ref, amt);
  const when = date ? new Date(date) : new Date();
  const number = await counterService.nextDocNumber("PAY", when.getFullYear(), 4);

  return journalService.post({
    date: when,
    description: note || `Payment to ${vendorDoc.name}`,
    refType: REF.PAYMENT,
    refNo: number,
    createdBy: actor ? actor._id : null,
    lines: [
      journalService.line(ACCOUNT.AP, { debit: amt, ref: vendorDoc._id }),
      journalService.line(settle.account, { credit: amt, ref: settle.ref }),
    ],
  });
}

// Receive from a customer: Dr Cash|Bank / Cr Accounts-Receivable (customer).
async function receiveFromCustomer(actor, { customer, amount, method = PAYMENT_METHOD.CASH, bankAccount, date, note }) {
  const customerDoc = await Customer.findById(customer);
  if (!customerDoc) throw ApiError.notFound("Customer not found");

  const amt = toPaisa(amount);
  if (amt <= 0) throw ApiError.badRequest("Amount must be positive");

  const settle = await settlementAccount(method, bankAccount);
  const when = date ? new Date(date) : new Date();
  const number = await counterService.nextDocNumber("RCPT", when.getFullYear(), 4);

  return journalService.post({
    date: when,
    description: note || `Receipt from ${customerDoc.name}`,
    refType: REF.RECEIPT,
    refNo: number,
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
async function cashEntry(actor, { direction, amount, date, note }) {
  const amt = toPaisa(amount);
  if (amt <= 0) throw ApiError.badRequest("Amount must be positive");
  if (direction !== "IN" && direction !== "OUT") {
    throw ApiError.badRequest("Direction must be IN or OUT");
  }
  // Taking cash out can't drive the drawer negative.
  if (direction === "OUT") await assertSufficientFunds(ACCOUNT.CASH, null, amt);
  const when = date ? new Date(date) : new Date();

  const lines =
    direction === "IN"
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
    description: note || (direction === "IN" ? "Cash in" : "Cash out"),
    refType: REF.CASH_ADJUST,
    createdBy: actor ? actor._id : null,
    lines,
  });
}

module.exports = { payVendor, receiveFromCustomer, cashEntry, settlementAccount };
