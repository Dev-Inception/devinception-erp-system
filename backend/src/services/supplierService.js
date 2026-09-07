const Supplier = require('../models/supplierModel');
const ApiError = require('../utils/ApiError');
const journalService = require('./journalService');
const { ACCOUNT } = require('../utils/finance');
const { toRupees } = require('../utils/money');
const { parsePagination, escapeRegex } = require('../utils/query');

/**
 * Supplier management — goods received on a stock receipt come from a
 * supplier. Authorization is enforced by route middleware; here we enforce
 * the data rules. `outstanding` is intentionally never accepted from the
 * client — it is maintained by purchase/payment flows.
 */

// Whitelist the fields a client may set, so `outstanding` (and anything else)
// can't be injected through the request body.
function pickWritable({ name, phone, email, ntn, address }) {
  const fields = { name, phone, email, ntn, address };
  // Drop undefined so a partial update only touches provided fields.
  Object.keys(fields).forEach((k) => fields[k] === undefined && delete fields[k]);
  return fields;
}

async function listSuppliers(query = {}) {
  // The stock-receipt supplier picker and the Suppliers page consume the
  // full list (no pagination UI), so allow a far larger page size than the
  // default cap.
  const { page, limit, skip } = parsePagination(query, { defaultLimit: 1000, maxLimit: 100000 });
  const filter = {};
  if (query.search) {
    const term = escapeRegex(query.search);
    filter.$or = [
      { name: { $regex: term, $options: 'i' } },
      { phone: { $regex: term, $options: 'i' } },
      { email: { $regex: term, $options: 'i' } },
    ];
  }

  const [docs, total, balances] = await Promise.all([
    Supplier.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    Supplier.countDocuments(filter),
    journalService.balancesByRef(ACCOUNT.AP_SUPPLIER, { store: query.store }),
  ]);

  // Replace the (legacy) stored outstanding with the live payable from the
  // ledger, in rupees, so the list matches the partner's statement.
  const suppliers = docs.map((s) => ({
    ...s,
    outstanding: toRupees(balances.get(String(s._id)) || 0),
  }));

  return { suppliers, total, page, limit };
}

async function getSupplierById(id) {
  const supplier = await Supplier.findById(id);
  if (!supplier) throw ApiError.notFound('Supplier not found');
  return supplier;
}

async function createSupplier(data) {
  return Supplier.create(pickWritable(data));
}

async function updateSupplier(id, data) {
  const supplier = await getSupplierById(id);
  Object.assign(supplier, pickWritable(data));
  await supplier.save();
  return supplier;
}

async function deleteSupplier(id) {
  const supplier = await getSupplierById(id);
  if (supplier.outstanding > 0) {
    throw ApiError.badRequest('Supplier has an outstanding balance and cannot be deleted');
  }
  await supplier.deleteOne();
}

module.exports = {
  listSuppliers,
  getSupplierById,
  createSupplier,
  updateSupplier,
  deleteSupplier,
};
