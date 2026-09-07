const mongoose = require('mongoose');
const Estimate = require('../models/estimateModel');
const Customer = require('../models/customerModel');
const Store = require('../models/storeModel');
const Product = require('../models/productModel');
const ApiError = require('../utils/ApiError');
const counterService = require('./counterService');
const { calculateInvoiceTotals, resolveUnitPrice } = require('./invoiceCalculationService');
const { parsePagination, escapeRegex } = require('../utils/query');
const { actorStoreId, assertStoreAccess } = require('../utils/storeScope');

/**
 * Estimates (quotes) for a prospective sale — no stock or ledger effect
 * until converted into a real Sale (see saleService.createSale's `estimate`
 * input, which marks this record CONVERTED once the sale actually posts).
 */

// Resolves catalog products for each line and prices them the same way a
// sale does (an omitted unitPrice falls back to the catalog's salePrice).
async function resolveItems(items) {
  if (!Array.isArray(items) || items.length === 0) {
    throw ApiError.badRequest('At least one item is required');
  }
  const products = await Product.find({ _id: { $in: items.map((it) => it.product) } });
  const productsById = new Map(products.map((p) => [String(p._id), p]));

  return items.map((it) => {
    const product = productsById.get(String(it.product));
    if (!product) throw ApiError.badRequest(`Product not found: ${it.product}`);
    return {
      product: product._id,
      name: product.name,
      quantity: it.quantity,
      unitPrice: resolveUnitPrice(it.unitPrice, product.salePrice),
    };
  });
}

async function resolveCustomer(actor, { customer, customerName, customerPhone, customerAddress }) {
  if (customer) {
    const doc = await Customer.findById(customer);
    if (!doc) throw ApiError.notFound('Customer not found');
    return {
      customer: doc._id,
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

async function createEstimate(actor, input) {
  const { store, date, items, discount = 0, taxPercent = 0, notes } = input;

  const restricted = actorStoreId(actor);
  const storeId = restricted || store;
  if (!storeId || !mongoose.isValidObjectId(storeId)) {
    throw ApiError.badRequest('A store is required');
  }
  const storeDoc = await Store.findById(storeId);
  if (!storeDoc) throw ApiError.badRequest('Store not found');
  assertStoreAccess(actor, storeDoc._id);

  const customerFields = await resolveCustomer(actor, input);
  const resolvedItems = await resolveItems(items);
  const calculated = calculateInvoiceTotals(resolvedItems, { discount, taxPercent });

  const when = date ? new Date(date) : new Date();
  const number = await counterService.nextDocNumber('EST', when.getFullYear(), 6);

  return Estimate.create({
    number,
    ...customerFields,
    store: storeDoc._id,
    date: when,
    items: calculated.items,
    subtotal: calculated.subtotal,
    discount: calculated.discount,
    taxPercent: calculated.taxPercent,
    tax: calculated.tax,
    total: calculated.total,
    notes: (notes || '').trim(),
    createdBy: actor ? actor._id : null,
  });
}

async function getEstimateById(actor, id) {
  const estimate = await Estimate.findById(id).populate('store', 'name code');
  if (!estimate) throw ApiError.notFound('Estimate not found');
  assertStoreAccess(actor, estimate.store?._id ?? estimate.store);
  return estimate;
}

// Full edit — blocked once converted (the real sale is the source of truth
// at that point) or lost (dead lead; re-open by creating a fresh estimate).
async function updateEstimate(actor, id, input) {
  const estimate = await Estimate.findById(id);
  if (!estimate) throw ApiError.notFound('Estimate not found');
  assertStoreAccess(actor, estimate.store);
  if (estimate.status === 'CONVERTED') {
    throw ApiError.badRequest('This estimate has already been converted to a sale');
  }
  if (estimate.status === 'LOST') {
    throw ApiError.badRequest('This estimate was marked lost and can no longer be edited');
  }

  const { items, discount = 0, taxPercent = 0, notes } = input;
  const customerFields = await resolveCustomer(actor, input);
  const resolvedItems = await resolveItems(items);
  const calculated = calculateInvoiceTotals(resolvedItems, { discount, taxPercent });

  Object.assign(estimate, customerFields, {
    items: calculated.items,
    subtotal: calculated.subtotal,
    discount: calculated.discount,
    taxPercent: calculated.taxPercent,
    tax: calculated.tax,
    total: calculated.total,
    notes: notes !== undefined ? notes.trim() : estimate.notes,
  });
  await estimate.save();
  return estimate;
}

// Logs a follow-up attempt (a call, a visit, ...) and optionally schedules
// the next one. A PENDING estimate becomes FOLLOWED_UP on its first log.
async function addFollowUp(actor, id, { note, nextFollowUpDate }) {
  const estimate = await Estimate.findById(id);
  if (!estimate) throw ApiError.notFound('Estimate not found');
  assertStoreAccess(actor, estimate.store);
  if (['CONVERTED', 'LOST'].includes(estimate.status)) {
    throw ApiError.badRequest(`This estimate is already ${estimate.status.toLowerCase()}`);
  }
  if (!note || !note.trim()) throw ApiError.badRequest('A follow-up note is required');

  estimate.followUps.push({ date: new Date(), note: note.trim(), by: actor ? actor._id : null });
  if (estimate.status === 'PENDING') estimate.status = 'FOLLOWED_UP';
  estimate.nextFollowUpDate = nextFollowUpDate ? new Date(nextFollowUpDate) : null;
  await estimate.save();
  return estimate;
}

async function markLost(actor, id, reason) {
  const estimate = await Estimate.findById(id);
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
// has actually posted — the estimate is done being a lead at that point.
async function markConverted(id, saleId) {
  await Estimate.updateOne(
    { _id: id },
    {
      $set: {
        status: 'CONVERTED',
        convertedSale: saleId,
        convertedAt: new Date(),
        nextFollowUpDate: null,
      },
    },
  );
}

async function deleteEstimate(actor, id) {
  const estimate = await Estimate.findById(id);
  if (!estimate) throw ApiError.notFound('Estimate not found');
  assertStoreAccess(actor, estimate.store);
  if (estimate.status === 'CONVERTED') {
    throw ApiError.badRequest('This estimate has already been converted to a sale');
  }
  await estimate.deleteOne();
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
  const { page, limit, skip } = parsePagination(query);
  const filter = {};

  const restricted = actorStoreId(actor);
  const effectiveStore = restricted || store;
  if (effectiveStore && mongoose.isValidObjectId(effectiveStore)) filter.store = effectiveStore;

  // A converted estimate is now a real sale — it's managed from the Sales
  // page (invoice, gate passes, returns) from here on, so the default
  // listing hides it. An explicit status query (e.g. a future audit view)
  // can still ask for it directly.
  filter.status = status || { $ne: 'CONVERTED' };
  if (from || to) {
    filter.date = {};
    if (from) filter.date.$gte = new Date(from);
    if (to) filter.date.$lte = new Date(to);
  }
  if (search) {
    const re = new RegExp(escapeRegex(search), 'i');
    filter.$or = [{ number: re }, { customerName: re }, { customerPhone: re }];
  }
  // "Due" = has a scheduled follow-up that's today or overdue, and hasn't
  // already been converted/lost.
  if (dueForFollowUp === 'true' || dueForFollowUp === true) {
    filter.nextFollowUpDate = { $lte: new Date() };
    filter.status = { $in: ['PENDING', 'FOLLOWED_UP'] };
  }

  const [estimates, total] = await Promise.all([
    Estimate.find(filter)
      .populate('store', 'name code')
      .sort({ date: -1, createdAt: -1 })
      .skip(skip)
      .limit(limit),
    Estimate.countDocuments(filter),
  ]);

  return { estimates, total, page, limit };
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
