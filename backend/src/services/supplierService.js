const { Op } = require('sequelize');
const { initializeModels } = require('../db/models');
const ApiError = require('../utils/ApiError');
const journalService = require('./journalService');
const { ACCOUNT } = require('../utils/finance');
const { toRupees } = require('../utils/money');
const { parsePagination } = require('../utils/query');
const { Supplier } = initializeModels();
const writable = ({ name, phone, email, ntn, address }) =>
  Object.fromEntries(
    Object.entries({ name, phone, email, ntn, address }).filter(([, value]) => value !== undefined),
  );
async function listSuppliers(query = {}) {
  const {
    page,
    limit,
    skip: offset,
  } = parsePagination(query, { defaultLimit: 1000, maxLimit: 100000 });
  const where = query.search
    ? {
        [Op.or]: ['name', 'phone', 'email'].map((field) => ({
          [field]: { [Op.iLike]: `%${query.search}%` },
        })),
      }
    : {};
  const [{ rows, count }, balances] = await Promise.all([
    Supplier.findAndCountAll({ where, order: [['createdAt', 'DESC']], offset, limit }),
    journalService.balancesByRef(ACCOUNT.AP_SUPPLIER, { store: query.store }),
  ]);
  return {
    suppliers: rows.map((row) => ({
      ...row.toJSON(),
      outstanding: toRupees(balances.get(row.id) || 0),
    })),
    total: count,
    page,
    limit,
  };
}
async function getSupplierById(id) {
  const row = await Supplier.findByPk(id);
  if (!row) throw ApiError.notFound('Supplier not found');
  return row;
}
const createSupplier = (data) => Supplier.create(writable(data));
async function updateSupplier(id, data) {
  return (await getSupplierById(id)).update(writable(data));
}
async function deleteSupplier(id) {
  const row = await getSupplierById(id);
  if (Number(row.outstanding) > 0)
    throw ApiError.badRequest('Supplier has an outstanding balance and cannot be deleted');
  await row.destroy();
}
module.exports = { listSuppliers, getSupplierById, createSupplier, updateSupplier, deleteSupplier };
