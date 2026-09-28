const { Op } = require('sequelize');
const { initializeModels } = require('../db/models');
const ApiError = require('../utils/ApiError');
const journalService = require('./journalService');
const { ACCOUNT } = require('../utils/finance');
const { toRupees } = require('../utils/money');
const { parsePagination } = require('../utils/query');
const {
  requireWriteStore,
  resolveStoreScope,
  storeWhere,
  assertStoreAccess,
} = require('../utils/storeScope');

/**
 * Supplier management — goods received on a stock receipt come from a
 * supplier. Authorization is enforced by route middleware; here we enforce
 * the data rules. `outstanding` is intentionally never accepted from the
 * client, and the stored column (kept only for schema parity with the old
 * Mongo model) is never trusted for a balance check either — the live
 * payable is always read from the ledger. Unlike vendors, suppliers have no
 * opening-balance/adjustment feature.
 */

// Escapes ILIKE wildcards so a search term is matched literally.
function escapeLike(str) {
  return String(str).replace(/[\\%_]/g, '\\$&');
}

// Whitelist the fields a client may set, so `outstanding` (and anything else)
// can't be injected through the request body.
function pickWritable({ name, phone, email, ntn, address }) {
  const fields = { name, phone, email, ntn, address };
  // Drop undefined so a partial update only touches provided fields.
  Object.keys(fields).forEach((k) => fields[k] === undefined && delete fields[k]);
  return fields;
}

async function listSuppliers(query = {}) {
  const { Supplier } = initializeModels();
  // The stock-receipt supplier picker and the Suppliers page consume the
  // full list (no pagination UI), so allow a far larger page size than the
  // default cap.
  const { page, limit, skip } = parsePagination(query, { defaultLimit: 1000, maxLimit: 100000 });
  const { storeIds } = await resolveStoreScope({ store: query.store, actor: query.actor });
  const where = { ...storeWhere(storeIds) };
  if (query.search) {
    const term = `%${escapeLike(query.search)}%`;
    where[Op.or] = [
      { name: { [Op.iLike]: term } },
      { phone: { [Op.iLike]: term } },
      { email: { [Op.iLike]: term } },
    ];
  }

  const [docs, total, balances] = await Promise.all([
    Supplier.findAll({ where, order: [['createdAt', 'DESC']], offset: skip, limit }),
    Supplier.count({ where }),
    journalService.balancesByRef(ACCOUNT.AP_SUPPLIER, { store: storeIds }),
  ]);

  // Replace the (legacy) stored outstanding with the live payable from the
  // ledger, in rupees, so the list matches the partner's statement.
  const suppliers = docs.map((s) => {
    const json = s.toJSON();
    return { ...json, outstanding: toRupees(balances.get(json._id) || 0) };
  });

  return { suppliers, total, page, limit };
}

async function getSupplierById(actor, id) {
  const { Supplier } = initializeModels();
  const supplier = await Supplier.findByPk(id);
  if (!supplier) throw ApiError.notFound('Supplier not found');
  assertStoreAccess(actor, supplier.store);
  return supplier;
}

async function createSupplier(actor, { store, ...data }) {
  const { Store, Supplier } = initializeModels();
  const storeId = requireWriteStore(actor, store);
  const storeDoc = await Store.findByPk(storeId);
  if (!storeDoc) throw ApiError.badRequest('Store not found');

  return Supplier.create({ ...pickWritable(data), store: storeDoc.id });
}

async function updateSupplier(actor, id, data) {
  const supplier = await getSupplierById(actor, id);
  Object.assign(supplier, pickWritable(data));
  await supplier.save();
  return supplier;
}

async function deleteSupplier(actor, id) {
  const supplier = await getSupplierById(actor, id);
  const balance = await journalService.accountBalance(ACCOUNT.AP_SUPPLIER, supplier.id);
  if (balance > 0) {
    throw ApiError.badRequest('Supplier has an outstanding balance and cannot be deleted');
  }
  await supplier.destroy();
}

module.exports = {
  listSuppliers,
  getSupplierById,
  createSupplier,
  updateSupplier,
  deleteSupplier,
};
