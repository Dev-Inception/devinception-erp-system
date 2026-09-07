const { Op } = require('sequelize');
const { initializeModels } = require('../db/models');
const ApiError = require('../utils/ApiError');
const journalService = require('./journalService');
const { ACCOUNT } = require('../utils/finance');
const { toRupees } = require('../utils/money');
const { parsePagination } = require('../utils/query');
const { Customer } = initializeModels();

/**
 * Customer management. Authorization is enforced by route middleware; here we
 * enforce the data rules. `outstanding` is intentionally never accepted from
 * the client — it is maintained by sale/payment flows.
 */

// Whitelist the fields a client may set, so `outstanding` can't be injected.
function pickWritable({ name, phone, email, address, creditLimit }) {
  const fields = { name, phone, email, address, creditLimit };
  // Drop undefined so a partial update only touches provided fields.
  Object.keys(fields).forEach((k) => fields[k] === undefined && delete fields[k]);
  return fields;
}

async function listCustomers(query = {}) {
  // The POS customer picker and the Customers page consume the full list (no
  // pagination UI), so allow a far larger page size than the default cap.
  const { page, limit, skip } = parsePagination(query, { defaultLimit: 1000, maxLimit: 100000 });
  const where = {};
  if (query.search) {
    const term = `%${query.search}%`;
    where[Op.or] = [
      { name: { [Op.iLike]: term } },
      { phone: { [Op.iLike]: term } },
      { email: { [Op.iLike]: term } },
    ];
  }

  const [docs, total, balances] = await Promise.all([
    Customer.findAll({ where, order: [['createdAt', 'DESC']], offset: skip, limit }),
    Customer.count({ where }),
    journalService.balancesByRef(ACCOUNT.AR),
  ]);

  // Show the live receivable from the ledger (rupees) as outstanding.
  const customers = docs.map((customer) => ({
    ...customer.toJSON(),
    outstanding: toRupees(balances.get(String(customer.id)) || 0),
  }));

  return { customers, total, page, limit };
}

async function getCustomerById(id) {
  const customer = await Customer.findByPk(id);
  if (!customer) throw ApiError.notFound('Customer not found');
  return customer;
}

async function createCustomer(data) {
  return Customer.create(pickWritable(data));
}

async function updateCustomer(id, data) {
  const customer = await getCustomerById(id);
  Object.assign(customer, pickWritable(data));
  await customer.save();
  return customer;
}

async function deleteCustomer(id) {
  const customer = await getCustomerById(id);
  if ((await journalService.accountBalance(ACCOUNT.AR, customer.id)) > 0) {
    throw ApiError.badRequest('Customer has an outstanding balance and cannot be deleted');
  }
  await customer.destroy();
}

module.exports = {
  listCustomers,
  getCustomerById,
  createCustomer,
  updateCustomer,
  deleteCustomer,
};
