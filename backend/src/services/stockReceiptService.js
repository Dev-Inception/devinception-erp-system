const mongoose = require('mongoose');
const StockReceipt = require('../models/stockReceiptModel');
const Vendor = require('../models/vendorModel');
const Warehouse = require('../models/warehouseModel');
const Store = require('../models/storeModel');
const Product = require('../models/productModel');
const ApiError = require('../utils/ApiError');
const { ACCOUNT, REF } = require('../utils/finance');
const journalService = require('./journalService');
const stockService = require('./stockService');
const counterService = require('./counterService');
const { normalizeQuantity } = require('../utils/quantity');
const { parsePagination, escapeRegex } = require('../utils/query');
const {
  resolveWarehouseScope,
  warehouseMongoFilter,
  actorStoreId,
  assertStoreAccess,
} = require('../utils/storeScope');

/**
 * Records a truck delivery from a vendor: one document per truck, with a
 * line per product covering both the good quantity received (added to
 * stock at the catalog purchase price) and the damaged quantity (recorded
 * for tracking only — damaged goods are written off on arrival and never
 * enter sellable stock, so they carry no stock/ledger effect).
 */
async function createReceipt(actor, { vendor, store, warehouse, date, truck, items, note }) {
  const vendorDoc = await Vendor.findById(vendor);
  if (!vendorDoc) throw ApiError.notFound('Vendor not found');
  // Every delivery is received for one physical storefront — required so
  // it's permanently on record which shop this stock was brought in for.
  const storeDoc = await Store.findById(store);
  if (!storeDoc) throw ApiError.badRequest('A store is required');
  assertStoreAccess(actor, storeDoc._id);
  const warehouseDoc = await Warehouse.findById(warehouse);
  if (!warehouseDoc) throw ApiError.notFound('Warehouse not found');
  if (!truck || !truck.vehicleNumber) {
    throw ApiError.badRequest('Truck vehicle number is required');
  }
  if (!Array.isArray(items) || items.length === 0) {
    throw ApiError.badRequest('At least one product line is required');
  }

  const products = await Product.find({ _id: { $in: items.map((it) => it.product) } });
  const productsById = new Map(products.map((p) => [String(p._id), p]));

  const lines = [];
  for (const it of items) {
    const product = productsById.get(String(it.product));
    if (!product) throw ApiError.badRequest(`Product ${it.product} not found`);
    const receivedQuantity = normalizeQuantity(it.receivedQuantity || 0);
    const damagedQuantity = normalizeQuantity(it.damagedQuantity || 0);
    if (receivedQuantity <= 0 && damagedQuantity <= 0) {
      throw ApiError.badRequest(`${product.name}: enter a received or damaged quantity`);
    }
    lines.push({ product, receivedQuantity, damagedQuantity });
  }

  const when = date ? new Date(date) : new Date();
  const number = await counterService.nextDocNumber('GRN', when.getFullYear(), 6);

  // Only the received-good quantity ever becomes stock; damaged units are
  // written off on arrival and are recorded on the receipt for tracking only.
  let totalReceivedValue = 0;
  for (const line of lines) {
    if (line.receivedQuantity <= 0) continue;
    totalReceivedValue += await stockService.receiveStock(
      line.product._id,
      warehouseDoc._id,
      line.receivedQuantity,
      line.product.purchasePrice || 0,
      { refType: 'PURCHASE', refNo: number, date: when },
    );
  }

  const receipt = await StockReceipt.create({
    number,
    vendor: vendorDoc._id,
    vendorName: vendorDoc.name,
    store: storeDoc._id,
    warehouse: warehouseDoc._id,
    date: when,
    truck: {
      vehicleNumber: truck.vehicleNumber,
      driverName: truck.driverName || '',
      driverPhone: truck.driverPhone || '',
    },
    items: lines.map((l) => ({
      product: l.product._id,
      name: l.product.name,
      receivedQuantity: l.receivedQuantity,
      damagedQuantity: l.damagedQuantity,
    })),
    note: (note || '').trim(),
    createdBy: actor ? actor._id : null,
  });

  if (totalReceivedValue > 0) {
    await journalService.post({
      date: when,
      description: `Stock receipt ${number} from ${vendorDoc.name}`,
      refType: REF.PURCHASE,
      refId: receipt._id,
      refNo: number,
      warehouse: warehouseDoc._id,
      store: storeDoc._id,
      createdBy: actor ? actor._id : null,
      lines: [
        journalService.line(ACCOUNT.INVENTORY, { debit: totalReceivedValue }),
        journalService.line(ACCOUNT.EQUITY, { credit: totalReceivedValue }),
      ],
    });
  }

  return receipt;
}

// Undoes a receipt's stock addition, one line at a time, by issuing the
// received quantity back out at the current moving-average cost — the same
// costing basis a normal issue uses, since the original cost layer can't be
// isolated once other movements have blended into the average. Returns the
// total inventory value removed, for the balancing journal reversal. Fails
// (blocking the edit/delete) if any of that stock has since been sold below
// the received quantity.
async function reverseReceiptStock(receipt, actor) {
  let reversedValue = 0;
  for (const it of receipt.items) {
    if (it.receivedQuantity <= 0) continue;
    try {
      reversedValue += await stockService.issueStock(
        it.product,
        receipt.warehouse,
        it.receivedQuantity,
        { refType: 'PURCHASE', refNo: receipt.number, date: new Date() },
      );
    } catch {
      throw ApiError.badRequest(
        `Cannot modify this receipt: stock received for ${it.name} has already been used`,
      );
    }
  }
  if (reversedValue > 0) {
    await journalService.post({
      date: new Date(),
      description: `Reversal for stock receipt ${receipt.number}`,
      refType: REF.PURCHASE,
      refId: receipt._id,
      refNo: receipt.number,
      warehouse: receipt.warehouse,
      store: receipt.store,
      createdBy: actor ? actor._id : null,
      lines: [
        journalService.line(ACCOUNT.EQUITY, { debit: reversedValue }),
        journalService.line(ACCOUNT.INVENTORY, { credit: reversedValue }),
      ],
    });
  }
  return reversedValue;
}

/**
 * Full receipt edit — reverses the original stock addition and its journal
 * entry, then re-validates and re-applies the revised lines exactly like
 * createReceipt. Blocked once any of the originally received stock has
 * already been sold (see reverseReceiptStock).
 */
async function updateReceipt(actor, id, { vendor, warehouse, date, truck, items, note }) {
  const receipt = await StockReceipt.findById(id);
  if (!receipt) throw ApiError.notFound('Stock receipt not found');
  assertStoreAccess(actor, receipt.store);

  const vendorDoc = await Vendor.findById(vendor);
  if (!vendorDoc) throw ApiError.notFound('Vendor not found');
  const warehouseDoc = await Warehouse.findById(warehouse);
  if (!warehouseDoc) throw ApiError.notFound('Warehouse not found');
  if (!truck || !truck.vehicleNumber) {
    throw ApiError.badRequest('Truck vehicle number is required');
  }
  if (!Array.isArray(items) || items.length === 0) {
    throw ApiError.badRequest('At least one product line is required');
  }

  const products = await Product.find({ _id: { $in: items.map((it) => it.product) } });
  const productsById = new Map(products.map((p) => [String(p._id), p]));

  const lines = [];
  for (const it of items) {
    const product = productsById.get(String(it.product));
    if (!product) throw ApiError.badRequest(`Product ${it.product} not found`);
    const receivedQuantity = normalizeQuantity(it.receivedQuantity || 0);
    const damagedQuantity = normalizeQuantity(it.damagedQuantity || 0);
    if (receivedQuantity <= 0 && damagedQuantity <= 0) {
      throw ApiError.badRequest(`${product.name}: enter a received or damaged quantity`);
    }
    lines.push({ product, receivedQuantity, damagedQuantity });
  }

  await reverseReceiptStock(receipt, actor);

  const when = date ? new Date(date) : receipt.date;

  let totalReceivedValue = 0;
  for (const line of lines) {
    if (line.receivedQuantity <= 0) continue;
    totalReceivedValue += await stockService.receiveStock(
      line.product._id,
      warehouseDoc._id,
      line.receivedQuantity,
      line.product.purchasePrice || 0,
      { refType: 'PURCHASE', refNo: receipt.number, date: when },
    );
  }

  receipt.vendor = vendorDoc._id;
  receipt.vendorName = vendorDoc.name;
  receipt.warehouse = warehouseDoc._id;
  receipt.date = when;
  receipt.truck = {
    vehicleNumber: truck.vehicleNumber,
    driverName: truck.driverName || '',
    driverPhone: truck.driverPhone || '',
  };
  receipt.items = lines.map((l) => ({
    product: l.product._id,
    name: l.product.name,
    receivedQuantity: l.receivedQuantity,
    damagedQuantity: l.damagedQuantity,
  }));
  receipt.note = (note || '').trim();
  await receipt.save();

  if (totalReceivedValue > 0) {
    await journalService.post({
      date: when,
      description: `Revised stock receipt ${receipt.number} from ${vendorDoc.name}`,
      refType: REF.PURCHASE,
      refId: receipt._id,
      refNo: receipt.number,
      warehouse: receipt.warehouse,
      store: receipt.store,
      createdBy: actor ? actor._id : null,
      lines: [
        journalService.line(ACCOUNT.INVENTORY, { debit: totalReceivedValue }),
        journalService.line(ACCOUNT.EQUITY, { credit: totalReceivedValue }),
      ],
    });
  }

  return receipt;
}

/**
 * Deletes a receipt after reversing its stock addition and the matching
 * journal entry (see reverseReceiptStock). Blocked once any of the
 * originally received stock has already been sold.
 */
async function deleteReceipt(actor, id) {
  const receipt = await StockReceipt.findById(id);
  if (!receipt) throw ApiError.notFound('Stock receipt not found');
  assertStoreAccess(actor, receipt.store);

  await reverseReceiptStock(receipt, actor);
  await receipt.deleteOne();
  return receipt;
}

async function listReceipts({ vendor, warehouse, store, from, to, search, actor, ...query } = {}) {
  const { page, limit, skip } = parsePagination(query);
  const filter = {};
  if (vendor) filter.vendor = vendor;
  // Every receipt now records its own storefront directly — filter on that
  // rather than the indirect (and looser) warehouse-membership scoping.
  // A store-restricted actor's own store always wins over the query param.
  const effectiveStore = actorStoreId(actor) || store;
  if (effectiveStore && mongoose.isValidObjectId(effectiveStore)) {
    filter.store = effectiveStore;
  } else if (warehouse) {
    const { warehouseIds } = await resolveWarehouseScope({ warehouse, actor });
    Object.assign(filter, warehouseMongoFilter(warehouseIds));
  }
  if (from || to) {
    filter.date = {};
    if (from) filter.date.$gte = new Date(from);
    if (to) filter.date.$lte = new Date(to);
  }
  if (search) {
    const re = new RegExp(escapeRegex(search), 'i');
    filter.$or = [{ number: re }, { vendorName: re }, { 'truck.vehicleNumber': re }];
  }

  const [receipts, total] = await Promise.all([
    StockReceipt.find(filter)
      .populate('warehouse', 'name')
      .populate('store', 'name code')
      .sort({ date: -1, createdAt: -1 })
      .skip(skip)
      .limit(limit),
    StockReceipt.countDocuments(filter),
  ]);

  return { receipts, total, page, limit };
}

module.exports = { createReceipt, updateReceipt, deleteReceipt, listReceipts };
