const Vendor = require('../models/vendorModel');
const GoodsPurchase = require('../models/goodsPurchaseModel');
const ApiError = require('../utils/ApiError');
const journalService = require('./journalService');
const { ACCOUNT } = require('../utils/finance');
const { toRupees } = require('../utils/money');
const { parsePagination, escapeRegex } = require('../utils/query');

/**
 * Vendor (supplier) management. Authorization is enforced by route
 * middleware; here we enforce the data rules. `outstanding` is intentionally
 * never accepted from the client — it is maintained by purchase/payment flows.
 */

// Whitelist the fields a client may set, so `outstanding` (and anything else)
// can't be injected through the request body.
function pickWritable({ name, phone, email, ntn, address }) {
  const fields = { name, phone, email, ntn, address };
  // Drop undefined so a partial update only touches provided fields.
  Object.keys(fields).forEach((k) => fields[k] === undefined && delete fields[k]);
  return fields;
}

async function listVendors(query = {}) {
  // The GP vendor picker and the Vendors page consume the full list (no
  // pagination UI), so allow a far larger page size than the default cap.
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
    Vendor.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    Vendor.countDocuments(filter),
    journalService.balancesByRef(ACCOUNT.AP),
  ]);

  // Replace the (legacy) stored outstanding with the live payable from the
  // ledger, in rupees, so the list matches the partner's statement.
  const vendors = docs.map((v) => ({
    ...v,
    outstanding: toRupees(balances.get(String(v._id)) || 0),
  }));

  return { vendors, total, page, limit };
}

async function getVendorById(id) {
  const vendor = await Vendor.findById(id);
  if (!vendor) throw ApiError.notFound('Vendor not found');
  return vendor;
}

async function createVendor(data) {
  return Vendor.create(pickWritable(data));
}

async function updateVendor(id, data) {
  const vendor = await getVendorById(id);
  Object.assign(vendor, pickWritable(data));
  await vendor.save();
  return vendor;
}

async function deleteVendor(id) {
  const vendor = await getVendorById(id);
  if (vendor.outstanding > 0) {
    throw ApiError.badRequest('Vendor has an outstanding balance and cannot be deleted');
  }
  if (await GoodsPurchase.exists({ vendor: id })) {
    throw ApiError.badRequest('Vendor has purchase history and cannot be deleted');
  }
  await vendor.deleteOne();
}

module.exports = {
  listVendors,
  getVendorById,
  createVendor,
  updateVendor,
  deleteVendor,
};
