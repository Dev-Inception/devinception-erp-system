const StockReceipt = require('../models/stockReceiptModel');
const Vendor = require('../models/vendorModel');
const Warehouse = require('../models/warehouseModel');
const Product = require('../models/productModel');
const ApiError = require('../utils/ApiError');
const { ACCOUNT, REF } = require('../utils/finance');
const journalService = require('./journalService');
const stockService = require('./stockService');
const counterService = require('./counterService');
const { normalizeQuantity } = require('../utils/quantity');
const { parsePagination, escapeRegex } = require('../utils/query');

/**
 * Records a truck delivery from a vendor: one document per truck, with a
 * line per product covering both the good quantity received (added to
 * stock at the catalog purchase price) and the damaged quantity (recorded
 * for tracking only — damaged goods are written off on arrival and never
 * enter sellable stock, so they carry no stock/ledger effect).
 */
async function createReceipt(actor, { vendor, warehouse, date, truck, items, note }) {
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
      createdBy: actor ? actor._id : null,
      lines: [
        journalService.line(ACCOUNT.INVENTORY, { debit: totalReceivedValue }),
        journalService.line(ACCOUNT.EQUITY, { credit: totalReceivedValue }),
      ],
    });
  }

  return receipt;
}

async function listReceipts({ vendor, warehouse, from, to, search, ...query } = {}) {
  const { page, limit, skip } = parsePagination(query);
  const filter = {};
  if (vendor) filter.vendor = vendor;
  if (warehouse) filter.warehouse = warehouse;
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
      .sort({ date: -1, createdAt: -1 })
      .skip(skip)
      .limit(limit),
    StockReceipt.countDocuments(filter),
  ]);

  return { receipts, total, page, limit };
}

module.exports = { createReceipt, listReceipts };
