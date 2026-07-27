const { Op } = require('sequelize');
const { initializeModels } = require('../db/models');
const ApiError = require('../utils/ApiError');
const journalService = require('./journalService');
const { ACCOUNT } = require('../utils/finance');
const { toRupees } = require('../utils/money');
const { parsePagination } = require('../utils/query');
const { Vendor, GoodsPurchase } = initializeModels();

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
    Vendor.findAll({ where, order: [['createdAt', 'DESC']], offset: skip, limit }),
    Vendor.count({ where }),
    journalService.balancesByRef(ACCOUNT.AP),
  ]);

  // Replace the (legacy) stored outstanding with the live payable from the
  // ledger, in rupees, so the list matches the partner's statement.
  const vendors = docs.map((vendor) => ({
    ...vendor.toJSON(),
    outstanding: toRupees(balances.get(String(vendor.id)) || 0),
  }));

  return { vendors, total, page, limit };
}

async function getVendorById(id) {
  const vendor = await Vendor.findByPk(id);
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
  if ((await journalService.accountBalance(ACCOUNT.AP, vendor.id)) > 0) {
    throw ApiError.badRequest('Vendor has an outstanding balance and cannot be deleted');
  }
  if (await GoodsPurchase.count({ where: { vendor: id } })) {
    throw ApiError.badRequest('Vendor has purchase history and cannot be deleted');
  }
  await vendor.destroy();
}

module.exports = {
  listVendors,
  getVendorById,
  createVendor,
  updateVendor,
  deleteVendor,
};
