const { Op } = require('sequelize');
const { initializeModels } = require('../db/models');
const { isValidId } = require('../db/id');
const ApiError = require('../utils/ApiError');
const journalService = require('./journalService');
const { ACCOUNT } = require('../utils/finance');
const { toRupees } = require('../utils/money');
const { parsePagination } = require('../utils/query');
const { actorStoreId, assertStoreAccess } = require('../utils/storeScope');

/**
 * Customer management. Authorization is enforced by route middleware; here we
 * enforce the data rules. `outstanding` is intentionally never accepted from
 * the client, and the stored column (kept only for schema parity with the old
 * Mongo model) is never trusted for a balance check either — the live
 * receivable is always read from the ledger, same as everywhere else.
 */

// Escapes ILIKE wildcards so a search term is matched literally.
function escapeLike(str) {
  return String(str).replace(/[\\%_]/g, '\\$&');
}

// Whitelist the fields a client may set, so `outstanding` can't be injected.
function pickWritable({ name, phone, email, address, creditLimit }) {
  const fields = { name, phone, email, address, creditLimit };
  // Drop undefined so a partial update only touches provided fields.
  Object.keys(fields).forEach((k) => fields[k] === undefined && delete fields[k]);
  return fields;
}

async function listCustomers(query = {}) {
  const { Customer } = initializeModels();
  // The POS customer picker and the Customers page consume the full list (no
  // pagination UI), so allow a far larger page size than the default cap.
  const { page, limit, skip } = parsePagination(query, { defaultLimit: 1000, maxLimit: 100000 });
  const where = {};
  if (query.search) {
    const term = `%${escapeLike(query.search)}%`;
    where[Op.or] = [
      { name: { [Op.iLike]: term } },
      { phone: { [Op.iLike]: term } },
      { email: { [Op.iLike]: term } },
      { address: { [Op.iLike]: term } },
    ];
  }

  const [docs, total, balances] = await Promise.all([
    Customer.findAll({ where, order: [['createdAt', 'DESC']], offset: skip, limit }),
    Customer.count({ where }),
    journalService.balancesByRef(ACCOUNT.AR, { store: query.store }),
  ]);

  // Show the live receivable from the ledger (rupees) as outstanding.
  const customers = docs.map((c) => {
    const json = c.toJSON();
    return { ...json, outstanding: toRupees(balances.get(json._id) || 0) };
  });

  return { customers, total, page, limit };
}

async function getCustomerById(id) {
  const { Customer } = initializeModels();
  const customer = await Customer.findByPk(id);
  if (!customer) throw ApiError.notFound('Customer not found');
  return customer;
}

async function createCustomer(actor, data) {
  const { Store, Customer } = initializeModels();
  // Every customer belongs to the store it was added from — a store-
  // restricted user (cashier, manager, ...) always gets their own store
  // regardless of what (if anything) they sent; an unrestricted actor
  // (super admin) must pick one explicitly, from the header's store switcher.
  const restricted = actorStoreId(actor);
  const storeId = restricted || data.store;
  if (!storeId) throw ApiError.badRequest('A store is required');
  if (!isValidId(storeId)) throw ApiError.badRequest('Invalid store');
  const storeDoc = await Store.findByPk(storeId);
  if (!storeDoc) throw ApiError.badRequest('Store not found');
  assertStoreAccess(actor, storeDoc.id);

  return Customer.create({ ...pickWritable(data), store: storeDoc.id });
}

async function updateCustomer(id, data) {
  const customer = await getCustomerById(id);
  Object.assign(customer, pickWritable(data));
  await customer.save();
  return customer;
}

async function deleteCustomer(id) {
  const customer = await getCustomerById(id);
  const balance = await journalService.accountBalance(ACCOUNT.AR, customer.id);
  if (balance > 0) {
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
