const bankAccountService = require('../services/bankAccountService');
const paymentService = require('../services/paymentService');
const ledgerService = require('../services/ledgerService');
const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/ApiResponse');
const { view } = require('../utils/money');

const out = (d) => (d && d.toJSON ? d.toJSON() : d);

// Statement rows + opening/closing, paisa -> rupees.
function serializeStatement(stmt) {
  return {
    ...stmt,
    opening: stmt.opening !== undefined ? view({ v: stmt.opening }, ['v']).v : undefined,
    closing: stmt.closing !== undefined ? view({ v: stmt.closing }, ['v']).v : undefined,
    rows: (stmt.rows || []).map((r) => view(r, ['debit', 'credit', 'balance'])),
  };
}

const serializeParty = (p) => view(out(p), ['balance']);

/* ----------------------------- Bank accounts ----------------------------- */

const listBankAccounts = asyncHandler(async (_req, res) => {
  const accounts = await bankAccountService.listBankAccounts();
  return sendSuccess(res, 200, 'Bank accounts fetched', {
    accounts: accounts.map((a) => view(a, ['balance'])),
  });
});

const createBankAccount = asyncHandler(async (req, res) => {
  const account = await bankAccountService.createBankAccount(req.user, req.body);
  return sendSuccess(res, 201, 'Bank account created', { account: out(account) });
});

const updateBankAccount = asyncHandler(async (req, res) => {
  const account = await bankAccountService.updateBankAccount(req.params.id, req.body);
  return sendSuccess(res, 200, 'Bank account updated', { account: out(account) });
});

const deleteBankAccount = asyncHandler(async (req, res) => {
  await bankAccountService.deleteBankAccount(req.params.id);
  return sendSuccess(res, 200, 'Bank account deleted');
});

/* ------------------------------- Payments -------------------------------- */

const payVendor = asyncHandler(async (req, res) => {
  const entry = await paymentService.payVendor(req.user, req.body);
  return sendSuccess(res, 201, 'Vendor payment recorded', { refNo: entry.refNo });
});

const receiveFromCustomer = asyncHandler(async (req, res) => {
  const entry = await paymentService.receiveFromCustomer(req.user, req.body);
  return sendSuccess(res, 201, 'Customer receipt recorded', { refNo: entry.refNo });
});

const cashEntry = asyncHandler(async (req, res) => {
  const entry = await paymentService.cashEntry(req.user, req.body);
  return sendSuccess(res, 201, 'Cash entry recorded', { id: entry._id });
});

const recordExpense = asyncHandler(async (req, res) => {
  const entry = await paymentService.recordExpense(req.user, req.body);
  return sendSuccess(res, 201, 'Operating expense recorded', {
    id: entry._id,
    refNo: entry.refNo,
  });
});

/* -------------------------------- Ledgers -------------------------------- */

const customerLedgers = asyncHandler(async (_req, res) => {
  const customers = await ledgerService.customerLedgers();
  return sendSuccess(res, 200, 'Customer ledgers fetched', {
    customers: customers.map(serializeParty),
  });
});

const vendorLedgers = asyncHandler(async (_req, res) => {
  const vendors = await ledgerService.vendorLedgers();
  return sendSuccess(res, 200, 'Vendor ledgers fetched', {
    vendors: vendors.map(serializeParty),
  });
});

const partyStatement = asyncHandler(async (req, res) => {
  const { kind, id } = req.params;
  const { from, to } = req.query;
  const result = await ledgerService.partyStatement(kind, id, { from, to });
  return sendSuccess(res, 200, 'Statement fetched', {
    party: out(result.party),
    ...serializeStatement({ opening: result.opening, closing: result.closing, rows: result.rows }),
  });
});

/* ------------------------------ Cash & Bank ------------------------------ */

const cashLedger = asyncHandler(async (req, res) => {
  const { from, to } = req.query;
  const stmt = await ledgerService.cashLedger({ from, to });
  return sendSuccess(res, 200, 'Cash ledger fetched', serializeStatement(stmt));
});

const bankLedger = asyncHandler(async (req, res) => {
  const { from, to } = req.query;
  const result = await ledgerService.bankLedger(req.params.id, { from, to });
  return sendSuccess(res, 200, 'Bank ledger fetched', {
    bank: out(result.bank),
    ...serializeStatement({ opening: result.opening, closing: result.closing, rows: result.rows }),
  });
});

module.exports = {
  listBankAccounts,
  createBankAccount,
  updateBankAccount,
  deleteBankAccount,
  payVendor,
  receiveFromCustomer,
  cashEntry,
  recordExpense,
  customerLedgers,
  vendorLedgers,
  partyStatement,
  cashLedger,
  bankLedger,
};
