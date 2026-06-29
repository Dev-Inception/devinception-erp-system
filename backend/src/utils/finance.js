/**
 * Finance/accounting vocabulary shared across the ledger, sales, purchase and
 * report modules. The ledger is a classic double-entry system: every journal
 * entry posts balanced debit/credit lines against "accounts", and every
 * higher-level view (party statement, cash book, reports) is just a query over
 * those lines. Nothing stores a running balance — balances are always derived.
 */

// The kinds of account a journal line can post against. Party kinds (AR/AP)
// and BANK carry a `ref` to the specific customer/vendor/bank account; the
// rest are singletons for the business as a whole.
const ACCOUNT = {
  CASH: "CASH", // cash on hand (asset)
  BANK: "BANK", // a specific bank account (asset), ref = BankAccount
  INVENTORY: "INVENTORY", // stock at cost (asset)
  AR: "AR", // accounts receivable (asset), ref = Customer
  AP: "AP", // accounts payable (liability), ref = Vendor
  SALES: "SALES", // sales revenue (income)
  COGS: "COGS", // cost of goods sold (expense)
  TAX: "TAX", // net sales tax payable: output tax (credit) − input tax (debit)
  EQUITY: "EQUITY", // opening balances / owner adjustments
};

const ACCOUNT_KINDS = Object.values(ACCOUNT);

// Kinds that increase with debits (assets + expenses). Everything else
// (liabilities, income, equity) increases with credits. This drives how a
// statement's running balance is computed.
const DEBIT_NORMAL = new Set([
  ACCOUNT.CASH,
  ACCOUNT.BANK,
  ACCOUNT.INVENTORY,
  ACCOUNT.AR,
  ACCOUNT.COGS,
]);

// Signed balance (in paisa) for an account given its debit/credit totals,
// using the account's natural sign so a positive number always means
// "what you'd expect" (cash on hand, money a customer owes us, money we owe a
// vendor, etc.).
function naturalBalance(kind, debit, credit) {
  return DEBIT_NORMAL.has(kind) ? debit - credit : credit - debit;
}

// Source document types a journal entry can reference.
const REF = {
  SALE: "SALE",
  PURCHASE: "PURCHASE",
  PAYMENT: "PAYMENT", // money paid to a vendor
  RECEIPT: "RECEIPT", // money received from a customer
  CASH_ADJUST: "CASH_ADJUST", // manual cash in/out
  OPENING: "OPENING", // opening balances
};

// How a sale (or purchase) was settled.
const PAYMENT_METHOD = {
  CASH: "CASH",
  CARD: "CARD",
  BANK_TRANSFER: "BANK_TRANSFER",
  ONLINE: "ONLINE",
  MIXED: "MIXED", // split across cash + a bank/online account
  CREDIT: "CREDIT", // on account (AR/AP), settled later
};

const PAYMENT_METHODS = Object.values(PAYMENT_METHOD);

// Methods that land in a bank/online account rather than the cash drawer.
const BANK_METHODS = new Set([
  PAYMENT_METHOD.CARD,
  PAYMENT_METHOD.BANK_TRANSFER,
  PAYMENT_METHOD.ONLINE,
]);

module.exports = {
  ACCOUNT,
  ACCOUNT_KINDS,
  DEBIT_NORMAL,
  naturalBalance,
  REF,
  PAYMENT_METHOD,
  PAYMENT_METHODS,
  BANK_METHODS,
};
