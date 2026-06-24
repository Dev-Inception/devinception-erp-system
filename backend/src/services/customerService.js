const Customer = require("../models/customerModel");
const ApiError = require("../utils/ApiError");
const journalService = require("./journalService");
const { ACCOUNT } = require("../utils/finance");
const { toRupees } = require("../utils/money");

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

async function listCustomers({ page = 1, limit = 20, search }) {
  const filter = {};
  if (search) {
    filter.$or = [
      { name: { $regex: search, $options: "i" } },
      { phone: { $regex: search, $options: "i" } },
      { email: { $regex: search, $options: "i" } },
    ];
  }

  const skip = (Math.max(page, 1) - 1) * limit;
  const [docs, total, balances] = await Promise.all([
    Customer.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    Customer.countDocuments(filter),
    journalService.balancesByRef(ACCOUNT.AR),
  ]);

  // Show the live receivable from the ledger (rupees) as outstanding.
  const customers = docs.map((c) => ({
    ...c,
    outstanding: toRupees(balances.get(String(c._id)) || 0),
  }));

  return { customers, total, page: Number(page), limit: Number(limit) };
}

async function getCustomerById(id) {
  const customer = await Customer.findById(id);
  if (!customer) throw ApiError.notFound("Customer not found");
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
  if (customer.outstanding > 0) {
    throw ApiError.badRequest(
      "Customer has an outstanding balance and cannot be deleted"
    );
  }
  await customer.deleteOne();
}

module.exports = {
  listCustomers,
  getCustomerById,
  createCustomer,
  updateCustomer,
  deleteCustomer,
};
