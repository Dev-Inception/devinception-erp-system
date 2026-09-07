const { Op } = require('sequelize');
const { initializeModels } = require('../db/models');
const { getPostgres } = require('../db/postgres');
const { isValidId } = require('../db/id');
const ApiError = require('../utils/ApiError');
const counterService = require('./counterService');
const { calculateInvoiceTotals, resolveUnitPrice } = require('./invoiceCalculationService');
const { parsePagination } = require('../utils/query');
const { actorStoreId, assertStoreAccess } = require('../utils/storeScope');
const { Estimate, EstimateItem, EstimateFollowUp, Customer, Store, Product } = initializeModels();
const actorId = (actor) => actor && (actor.id || actor._id);
async function resolveItems(items) {
  if (!items?.length) throw ApiError.badRequest('At least one item is required');
  const rows = await Product.findAll({ where: { id: { [Op.in]: items.map((i) => i.product) } } });
  const byId = new Map(rows.map((r) => [r.id, r]));
  return items.map((item) => {
    const product = byId.get(String(item.product));
    if (!product) throw ApiError.badRequest(`Product not found: ${item.product}`);
    return {
      product: product.id,
      name: product.name,
      quantity: item.quantity,
      unitPrice: resolveUnitPrice(item.unitPrice, product.salePrice),
    };
  });
}
async function resolveCustomer(input) {
  if (input.customer) {
    const row = await Customer.findByPk(input.customer);
    if (!row) throw ApiError.notFound('Customer not found');
    return {
      customer: row.id,
      customerName: row.name,
      customerPhone: row.phone || '',
      customerAddress: row.address || '',
    };
  }
  if (!input.customerName?.trim()) throw ApiError.badRequest('A customer name is required');
  return {
    customer: null,
    customerName: input.customerName.trim(),
    customerPhone: (input.customerPhone || '').trim(),
    customerAddress: (input.customerAddress || '').trim(),
  };
}
async function load(id, transaction) {
  const row = await Estimate.findByPk(id, {
    include: [
      { model: EstimateItem, as: 'items' },
      { model: EstimateFollowUp, as: 'followUps' },
      { model: Store, as: 'storeInfo', attributes: ['id', 'name', 'code'] },
    ],
    transaction,
  });
  if (!row) return null;
  const value = row.toJSON();
  value._id = value.id;
  if (value.storeInfo) value.store = value.storeInfo;
  delete value.storeInfo;
  return value;
}
async function writeItems(id, items, transaction) {
  await EstimateItem.destroy({ where: { estimateId: id }, transaction });
  await EstimateItem.bulkCreate(
    items.map((item, position) => ({ ...item, estimateId: id, position })),
    { transaction },
  );
}
async function createEstimate(actor, input) {
  const store = actorStoreId(actor) || input.store;
  if (!store || !isValidId(String(store))) throw ApiError.badRequest('A store is required');
  if (!(await Store.findByPk(store))) throw ApiError.badRequest('Store not found');
  assertStoreAccess(actor, store);
  const lines = await resolveItems(input.items);
  const totals = calculateInvoiceTotals(lines, {
    discount: input.discount || 0,
    taxPercent: input.taxPercent || 0,
  });
  const when = input.date ? new Date(input.date) : new Date();
  const number = await counterService.nextDocNumber('EST', when.getFullYear(), 6);
  return getPostgres().transaction(async (transaction) => {
    const row = await Estimate.create(
      {
        number,
        ...(await resolveCustomer(input)),
        store,
        date: when,
        subtotal: totals.subtotal,
        discount: totals.discount,
        taxPercent: totals.taxPercent,
        tax: totals.tax,
        total: totals.total,
        notes: (input.notes || '').trim(),
        createdBy: actorId(actor),
      },
      { transaction },
    );
    await writeItems(row.id, totals.items, transaction);
    return load(row.id, transaction);
  });
}
async function getEstimateById(actor, id) {
  const row = await load(id);
  if (!row) throw ApiError.notFound('Estimate not found');
  assertStoreAccess(actor, row.store?.id || row.store);
  return row;
}
async function updateEstimate(actor, id, input) {
  const row = await Estimate.findByPk(id);
  if (!row) throw ApiError.notFound('Estimate not found');
  assertStoreAccess(actor, row.store);
  if (row.status === 'CONVERTED')
    throw ApiError.badRequest('This estimate has already been converted to a sale');
  if (row.status === 'LOST')
    throw ApiError.badRequest('This estimate was marked lost and can no longer be edited');
  const lines = await resolveItems(input.items);
  const totals = calculateInvoiceTotals(lines, {
    discount: input.discount || 0,
    taxPercent: input.taxPercent || 0,
  });
  return getPostgres().transaction(async (transaction) => {
    await row.update(
      {
        ...(await resolveCustomer(input)),
        subtotal: totals.subtotal,
        discount: totals.discount,
        taxPercent: totals.taxPercent,
        tax: totals.tax,
        total: totals.total,
        notes: input.notes === undefined ? row.notes : input.notes.trim(),
      },
      { transaction },
    );
    await writeItems(id, totals.items, transaction);
    return load(id, transaction);
  });
}
async function addFollowUp(actor, id, { note, nextFollowUpDate }) {
  const row = await Estimate.findByPk(id);
  if (!row) throw ApiError.notFound('Estimate not found');
  assertStoreAccess(actor, row.store);
  if (['CONVERTED', 'LOST'].includes(row.status))
    throw ApiError.badRequest(`This estimate is already ${row.status.toLowerCase()}`);
  if (!note?.trim()) throw ApiError.badRequest('A follow-up note is required');
  return getPostgres().transaction(async (transaction) => {
    const position = await EstimateFollowUp.count({ where: { estimateId: id }, transaction });
    await EstimateFollowUp.create(
      { estimateId: id, position, note: note.trim(), by: actorId(actor) },
      { transaction },
    );
    await row.update(
      {
        status: row.status === 'PENDING' ? 'FOLLOWED_UP' : row.status,
        nextFollowUpDate: nextFollowUpDate ? new Date(nextFollowUpDate) : null,
      },
      { transaction },
    );
    return load(id, transaction);
  });
}
async function markLost(actor, id, reason) {
  const row = await Estimate.findByPk(id);
  if (!row) throw ApiError.notFound('Estimate not found');
  assertStoreAccess(actor, row.store);
  if (row.status === 'CONVERTED')
    throw ApiError.badRequest('This estimate has already been converted to a sale');
  await row.update({ status: 'LOST', lostReason: (reason || '').trim(), nextFollowUpDate: null });
  return load(id);
}
const markConverted = (id, saleId) =>
  Estimate.update(
    { status: 'CONVERTED', convertedSale: saleId, convertedAt: new Date(), nextFollowUpDate: null },
    { where: { id } },
  );
async function deleteEstimate(actor, id) {
  const row = await Estimate.findByPk(id);
  if (!row) throw ApiError.notFound('Estimate not found');
  assertStoreAccess(actor, row.store);
  if (row.status === 'CONVERTED')
    throw ApiError.badRequest('This estimate has already been converted to a sale');
  await row.destroy();
}
async function listEstimates({
  status,
  search,
  from,
  to,
  store,
  dueForFollowUp,
  actor,
  ...query
} = {}) {
  const { page, limit, skip: offset } = parsePagination(query);
  const where = {};
  const scopedStore = actorStoreId(actor) || store;
  if (scopedStore && isValidId(String(scopedStore))) where.store = scopedStore;
  where.status = status || { [Op.ne]: 'CONVERTED' };
  if (from || to) {
    where.date = {};
    if (from) where.date[Op.gte] = new Date(from);
    if (to) where.date[Op.lte] = new Date(to);
  }
  if (search)
    where[Op.or] = ['number', 'customerName', 'customerPhone'].map((field) => ({
      [field]: { [Op.iLike]: `%${search}%` },
    }));
  if (dueForFollowUp === 'true' || dueForFollowUp === true) {
    where.nextFollowUpDate = { [Op.lte]: new Date() };
    where.status = { [Op.in]: ['PENDING', 'FOLLOWED_UP'] };
  }
  const { rows, count } = await Estimate.findAndCountAll({
    where,
    order: [
      ['date', 'DESC'],
      ['createdAt', 'DESC'],
    ],
    offset,
    limit,
  });
  const estimates = await Promise.all(rows.map((row) => load(row.id)));
  return { estimates, total: count, page, limit };
}
module.exports = {
  createEstimate,
  getEstimateById,
  updateEstimate,
  addFollowUp,
  markLost,
  markConverted,
  deleteEstimate,
  listEstimates,
};
