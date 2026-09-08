const { Op } = require('sequelize');
const { getPostgres } = require('../db/postgres');
const { initializeModels } = require('../db/models');
const { isValidId } = require('../db/id');
const ApiError = require('../utils/ApiError');
const counterService = require('./counterService');
const { calculateInvoiceTotals, resolveUnitPrice } = require('./invoiceCalculationService');
const { parsePagination, escapeLike } = require('../utils/query');
const { actorStoreId, assertStoreAccess } = require('../utils/storeScope');

/**
 * Estimates (quotes) for a prospective sale — no stock or ledger effect
 * until converted into a real Sale (see saleService.createSale's `estimate`
 * input, which marks this record CONVERTED once the sale actually posts).
 */

// Resolves catalog products for each line and prices them the same way a
// sale does (an omitted unitPrice falls back to the catalog's salePrice).
async function resolveItems(items, transaction) {
  if (!Array.isArray(items) || items.length === 0) {
    throw ApiError.badRequest('At least one item is required');
  }
  const { Product } = initializeModels();
  const products = await Product.findAll({
    where: { id: items.map((it) => it.product) },
    transaction,
  });
  const productsById = new Map(products.map((p) => [String(p.id), p]));

  return items.map((it) => {
    const product = productsById.get(String(it.product));
    if (!product) throw ApiError.badRequest(`Product not found: ${it.product}`);
    return {
      product: product.id,
      name: product.name,
      quantity: it.quantity,
      unitPrice: resolveUnitPrice(it.unitPrice, product.salePrice),
    };
  });
}

async function resolveCustomer(
  actor,
  { customer, customerName, customerPhone, customerAddress },
  transaction,
) {
  if (customer) {
    const { Customer } = initializeModels();
    const doc = await Customer.findByPk(customer, { transaction });
    if (!doc) throw ApiError.notFound('Customer not found');
    return {
      customer: doc.id,
      customerName: doc.name,
      customerPhone: doc.phone || '',
      customerAddress: doc.address || '',
    };
  }
  if (!customerName || !customerName.trim()) {
    throw ApiError.badRequest('A customer name is required');
  }
  return {
    customer: null,
    customerName: customerName.trim(),
    customerPhone: (customerPhone || '').trim(),
    customerAddress: (customerAddress || '').trim(),
  };
}

async function reloadWithItems(id, transaction) {
  const { Estimate, EstimateItem, EstimateFollowUp, Store, User } = initializeModels();
  return Estimate.findByPk(id, {
    include: [
      { model: EstimateItem, as: 'items', separate: true, order: [['position', 'ASC']] },
      {
        model: EstimateFollowUp,
        as: 'followUps',
        separate: true,
        order: [['position', 'ASC']],
        include: [{ model: User, as: 'byInfo', attributes: ['id', 'name'] }],
      },
      { model: Store, as: 'storeInfo', attributes: ['id', 'name', 'code'] },
      { model: User, as: 'creator', attributes: ['id', 'name'] },
    ],
    transaction,
  });
}

async function createEstimate(actor, input) {
  const { store, date, items, discount = 0, taxPercent = 0, notes } = input;

  return getPostgres().transaction(async (transaction) => {
    const { Estimate, EstimateItem, Store } = initializeModels();

    const restricted = actorStoreId(actor);
    const storeId = restricted || store;
    if (!storeId || !isValidId(storeId)) {
      throw ApiError.badRequest('A store is required');
    }
    const storeDoc = await Store.findByPk(storeId, { transaction });
    if (!storeDoc) throw ApiError.badRequest('Store not found');
    assertStoreAccess(actor, storeDoc.id);

    const customerFields = await resolveCustomer(actor, input, transaction);
    const resolvedItems = await resolveItems(items, transaction);
    const calculated = calculateInvoiceTotals(resolvedItems, { discount, taxPercent });

    const when = date ? new Date(date) : new Date();
    const number = await counterService.nextDocNumber('EST', when.getFullYear(), 6, transaction);

    const estimate = await Estimate.create(
      {
        number,
        ...customerFields,
        store: storeDoc.id,
        date: when,
        subtotal: calculated.subtotal,
        discount: calculated.discount,
        taxPercent: calculated.taxPercent,
        tax: calculated.tax,
        total: calculated.total,
        notes: (notes || '').trim(),
        createdBy: actor ? actor.id : null,
      },
      { transaction },
    );
    await EstimateItem.bulkCreate(
      calculated.items.map((item, position) => ({ estimateId: estimate.id, position, ...item })),
      { transaction },
    );

    return reloadWithItems(estimate.id, transaction);
  });
}

async function getEstimateById(actor, id) {
  const estimate = await reloadWithItems(id);
  if (!estimate) throw ApiError.notFound('Estimate not found');
  assertStoreAccess(actor, estimate.store);
  return estimate;
}

// Full edit — blocked once converted (the real sale is the source of truth
// at that point) or lost (dead lead; re-open by creating a fresh estimate).
async function updateEstimate(actor, id, input) {
  return getPostgres().transaction(async (transaction) => {
    const { Estimate, EstimateItem } = initializeModels();
    const estimate = await Estimate.findByPk(id, { transaction, lock: transaction.LOCK.UPDATE });
    if (!estimate) throw ApiError.notFound('Estimate not found');
    assertStoreAccess(actor, estimate.store);
    if (estimate.status === 'CONVERTED') {
      throw ApiError.badRequest('This estimate has already been converted to a sale');
    }
    if (estimate.status === 'LOST') {
      throw ApiError.badRequest('This estimate was marked lost and can no longer be edited');
    }

    const { items, discount = 0, taxPercent = 0, notes } = input;
    const customerFields = await resolveCustomer(actor, input, transaction);
    const resolvedItems = await resolveItems(items, transaction);
    const calculated = calculateInvoiceTotals(resolvedItems, { discount, taxPercent });

    Object.assign(estimate, customerFields, {
      subtotal: calculated.subtotal,
      discount: calculated.discount,
      taxPercent: calculated.taxPercent,
      tax: calculated.tax,
      total: calculated.total,
      notes: notes !== undefined ? notes.trim() : estimate.notes,
    });
    await estimate.save({ transaction });

    await EstimateItem.destroy({ where: { estimateId: estimate.id }, transaction });
    await EstimateItem.bulkCreate(
      calculated.items.map((item, position) => ({ estimateId: estimate.id, position, ...item })),
      { transaction },
    );

    return reloadWithItems(estimate.id, transaction);
  });
}

// Logs a follow-up attempt (a call, a visit, ...) and optionally schedules
// the next one. A PENDING estimate becomes FOLLOWED_UP on its first log.
async function addFollowUp(actor, id, { note, nextFollowUpDate }) {
  return getPostgres().transaction(async (transaction) => {
    const { Estimate, EstimateFollowUp } = initializeModels();
    const estimate = await Estimate.findByPk(id, { transaction, lock: transaction.LOCK.UPDATE });
    if (!estimate) throw ApiError.notFound('Estimate not found');
    assertStoreAccess(actor, estimate.store);
    if (['CONVERTED', 'LOST'].includes(estimate.status)) {
      throw ApiError.badRequest(`This estimate is already ${estimate.status.toLowerCase()}`);
    }
    if (!note || !note.trim()) throw ApiError.badRequest('A follow-up note is required');

    const position = await EstimateFollowUp.count({
      where: { estimateId: estimate.id },
      transaction,
    });
    await EstimateFollowUp.create(
      {
        estimateId: estimate.id,
        position,
        date: new Date(),
        note: note.trim(),
        by: actor ? actor.id : null,
      },
      { transaction },
    );
    if (estimate.status === 'PENDING') estimate.status = 'FOLLOWED_UP';
    estimate.nextFollowUpDate = nextFollowUpDate ? new Date(nextFollowUpDate) : null;
    await estimate.save({ transaction });

    return reloadWithItems(estimate.id, transaction);
  });
}

async function markLost(actor, id, reason) {
  const { Estimate } = initializeModels();
  const estimate = await Estimate.findByPk(id);
  if (!estimate) throw ApiError.notFound('Estimate not found');
  assertStoreAccess(actor, estimate.store);
  if (estimate.status === 'CONVERTED') {
    throw ApiError.badRequest('This estimate has already been converted to a sale');
  }
  estimate.status = 'LOST';
  estimate.lostReason = (reason || '').trim();
  estimate.nextFollowUpDate = null;
  await estimate.save();
  return estimate;
}

// Called from saleService.createSale once a sale referencing this estimate
// has actually posted — must run inside the same transaction as the sale.
async function markConverted(id, saleId, transaction) {
  const { Estimate } = initializeModels();
  await Estimate.update(
    { status: 'CONVERTED', convertedSale: saleId, convertedAt: new Date(), nextFollowUpDate: null },
    { where: { id }, transaction },
  );
}

async function deleteEstimate(actor, id) {
  const { Estimate } = initializeModels();
  const estimate = await Estimate.findByPk(id);
  if (!estimate) throw ApiError.notFound('Estimate not found');
  assertStoreAccess(actor, estimate.store);
  if (estimate.status === 'CONVERTED') {
    throw ApiError.badRequest('This estimate has already been converted to a sale');
  }
  await estimate.destroy();
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
  const { Estimate, Store } = initializeModels();
  const { page, limit, skip } = parsePagination(query);
  const where = {};

  const restricted = actorStoreId(actor);
  const effectiveStore = restricted || store;
  if (effectiveStore && isValidId(effectiveStore)) where.store = effectiveStore;

  // A converted estimate is now a real sale — it's managed from the Sales
  // page (invoice, gate passes, returns) from here on, so the default
  // listing hides it. An explicit status query (e.g. a future audit view)
  // can still ask for it directly.
  where.status = status || { [Op.ne]: 'CONVERTED' };
  if (from || to) {
    where.date = {};
    if (from) where.date[Op.gte] = new Date(from);
    if (to) where.date[Op.lte] = new Date(to);
  }
  if (search) {
    const term = `%${escapeLike(search)}%`;
    where[Op.or] = [
      { number: { [Op.iLike]: term } },
      { customerName: { [Op.iLike]: term } },
      { customerPhone: { [Op.iLike]: term } },
    ];
  }
  // "Due" = has a scheduled follow-up that's today or overdue, and hasn't
  // already been converted/lost.
  if (dueForFollowUp === 'true' || dueForFollowUp === true) {
    where.nextFollowUpDate = { [Op.lte]: new Date() };
    where.status = { [Op.in]: ['PENDING', 'FOLLOWED_UP'] };
  }

  const { rows, count } = await Estimate.findAndCountAll({
    where,
    include: [{ model: Store, as: 'storeInfo', attributes: ['id', 'name', 'code'] }],
    order: [
      ['date', 'DESC'],
      ['createdAt', 'DESC'],
    ],
    offset: skip,
    limit,
  });

  return { estimates: rows, total: count, page, limit };
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
