const { initializeModels } = require('../db/models');
const { isValidId } = require('../db/id');
const ApiError = require('../utils/ApiError');
const { ACCOUNT } = require('../utils/finance');
const journalService = require('./journalService');
const { Customer, Vendor, Supplier, Labour, Transporter, BankAccount } = initializeModels();
const configs = {
  customer: [Customer, ACCOUNT.AR],
  vendor: [Vendor, ACCOUNT.AP],
  supplier: [Supplier, ACCOUNT.AP_SUPPLIER],
  labour: [Labour, ACCOUNT.AP_LABOUR],
  transport: [Transporter, ACCOUNT.AP_TRANSPORT],
};
const range = ({ from, to } = {}) => ({
  from: from ? new Date(from) : undefined,
  to: to ? new Date(to) : undefined,
});
async function list(Model, account) {
  const [rows, balances] = await Promise.all([
    Model.findAll({ order: [['name', 'ASC']] }),
    journalService.balancesByRef(account),
  ]);
  return rows.map((r) => ({ ...r.toJSON(), balance: balances.get(r.id) || 0 }));
}
const customerLedgers = () => list(Customer, ACCOUNT.AR);
const vendorLedgers = () => list(Vendor, ACCOUNT.AP);
const supplierLedgers = () => list(Supplier, ACCOUNT.AP_SUPPLIER);
const labourLedgers = () => list(Labour, ACCOUNT.AP_LABOUR);
const transporterLedgers = () => list(Transporter, ACCOUNT.AP_TRANSPORT);
async function partyStatement(kind, id, options = {}) {
  const config = configs[kind];
  if (!config)
    throw ApiError.badRequest(
      "Ledger kind must be 'customer', 'vendor', 'supplier', 'labour', or 'transport'",
    );
  const party = await config[0].findByPk(id);
  if (!party) throw ApiError.notFound(`${kind} not found`);
  return {
    party,
    ...(await journalService.accountStatement(config[1], id, {
      ...range(options),
      store: isValidId(options.store) ? options.store : undefined,
    })),
  };
}
const cashLedger = (options = {}) =>
  journalService.accountStatement(ACCOUNT.CASH, null, {
    ...range(options),
    store: isValidId(options.store) ? options.store : undefined,
  });
async function bankLedger(id, options = {}) {
  const bank = await BankAccount.findByPk(id);
  if (!bank) throw ApiError.notFound('Bank account not found');
  return {
    bank,
    ...(await journalService.accountStatement(ACCOUNT.BANK, id, {
      ...range(options),
      store: isValidId(options.store) ? options.store : undefined,
    })),
  };
}
module.exports = {
  customerLedgers,
  vendorLedgers,
  supplierLedgers,
  labourLedgers,
  transporterLedgers,
  partyStatement,
  cashLedger,
  bankLedger,
};
