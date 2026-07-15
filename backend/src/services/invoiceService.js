const Invoice = require('../models/invoiceModel');
const GoodsPurchase = require('../models/goodsPurchaseModel');
const ApiError = require('../utils/ApiError');
const { toPaisa } = require('../utils/money');
const { parsePagination } = require('../utils/query');
const paymentService = require('./paymentService');

const PURCHASE_TYPE = 'PURCHASE';

function refId(value) {
  return value && typeof value === 'object' && value._id ? value._id : value;
}

function paymentStatus(total, paid, balance) {
  if (balance <= 0 || total <= paid) return 'PAID';
  if (paid > 0) return 'PARTIAL';
  return 'UNPAID';
}

// Copy the immutable invoice details from the purchase and keep the payment
// fields synchronized. All monetary values remain stored as integer paisa.
function invoiceSnapshot(purchase) {
  const p = purchase.toObject ? purchase.toObject() : purchase;
  const paid = p.paid || 0;
  const balance = Number.isFinite(p.balance) ? p.balance : p.total - paid;
  return {
    type: PURCHASE_TYPE,
    purchase: p._id,
    number: p.number,
    vendorInvoiceNo: p.vendorInvoiceNo || '',
    vendor: refId(p.vendor),
    vendorName: p.vendorName || (p.vendor && p.vendor.name) || '',
    warehouse: refId(p.warehouse),
    date: p.date,
    items: (p.items || []).map((item) => ({
      product: refId(item.product),
      name: item.name,
      quantity: item.quantity,
      unitCost: item.unitCost,
      taxPercent: item.taxPercent || 0,
      tax: item.tax || 0,
      lineTotal: item.lineTotal,
    })),
    subtotal: p.subtotal,
    discount: p.discount || 0,
    tax: p.tax || 0,
    total: p.total,
    paid,
    balance,
    status: paymentStatus(p.total, paid, balance),
    notes: p.notes || '',
    createdBy: refId(p.createdBy) || null,
  };
}

async function populatedInvoice(id) {
  return Invoice.findOne({ _id: id, type: PURCHASE_TYPE })
    .populate('vendor', 'name phone email address')
    .populate('warehouse', 'name location address');
}

async function persistPurchaseInvoice(purchase) {
  const snapshot = invoiceSnapshot(purchase);
  try {
    return await Invoice.findOneAndUpdate(
      { type: PURCHASE_TYPE, purchase: purchase._id },
      { $set: snapshot },
      {
        upsert: true,
        returnDocument: 'after',
        setDefaultsOnInsert: true,
        runValidators: true,
      },
    );
  } catch (error) {
    // Two concurrent requests can both try the upsert before the unique index
    // resolves the winner. Return the winning record instead of failing.
    if (error && error.code === 11000) {
      const existing = await Invoice.findOne({ type: PURCHASE_TYPE, purchase: purchase._id });
      if (existing) return existing;
    }
    throw error;
  }
}

// Reconcile purchases created before invoice persistence was introduced.
async function backfillPurchaseInvoices() {
  const invoicePurchaseIds = await Invoice.distinct('purchase', { type: PURCHASE_TYPE });
  const missing = await GoodsPurchase.find({ _id: { $nin: invoicePurchaseIds } });
  if (missing.length === 0) return;

  await Invoice.bulkWrite(
    missing.map((purchase) => ({
      updateOne: {
        filter: { type: PURCHASE_TYPE, purchase: purchase._id },
        update: { $setOnInsert: invoiceSnapshot(purchase) },
        upsert: true,
      },
    })),
    { ordered: false },
  );
}

async function listPurchaseInvoices({ vendor, status, from, to, ...query } = {}) {
  await backfillPurchaseInvoices();
  const { page, limit, skip } = parsePagination(query);
  const filter = { type: PURCHASE_TYPE };
  if (vendor) filter.vendor = vendor;
  if (status) filter.status = status;
  if (from || to) {
    filter.date = {};
    if (from) filter.date.$gte = new Date(from);
    if (to) filter.date.$lte = new Date(to);
  }

  const [invoices, total] = await Promise.all([
    Invoice.find(filter)
      .populate('vendor', 'name phone email address')
      .populate('warehouse', 'name location address')
      .sort({ date: -1, createdAt: -1 })
      .skip(skip)
      .limit(limit),
    Invoice.countDocuments(filter),
  ]);
  return { invoices, total, page, limit };
}

async function getPurchaseInvoiceById(id) {
  const invoice = await populatedInvoice(id);
  if (!invoice) throw ApiError.notFound('Purchase invoice not found');
  return invoice;
}

async function createFromPurchase(purchaseId) {
  const purchase = await GoodsPurchase.findById(purchaseId);
  if (!purchase) throw ApiError.notFound('Purchase not found');
  const invoice = await persistPurchaseInvoice(purchase);
  return populatedInvoice(invoice._id);
}

async function rollbackInvoicePayment(invoiceId, purchaseId, amount) {
  await Promise.all([
    Invoice.findByIdAndUpdate(
      invoiceId,
      [
        {
          $set: {
            paid: { $subtract: ['$paid', amount] },
            balance: { $add: ['$balance', amount] },
            status: {
              $cond: [{ $gt: [{ $subtract: ['$paid', amount] }, 0] }, 'PARTIAL', 'UNPAID'],
            },
          },
        },
      ],
      { updatePipeline: true },
    ),
    GoodsPurchase.findByIdAndUpdate(
      purchaseId,
      [
        {
          $set: {
            paid: { $subtract: ['$paid', amount] },
            balance: { $add: ['$balance', amount] },
          },
        },
      ],
      { updatePipeline: true },
    ),
  ]);
}

async function payPurchaseInvoice(actor, id, { amount, method, bankAccount, date, note }) {
  const amt = toPaisa(amount);
  if (amt <= 0) throw ApiError.badRequest('Amount must be positive');

  const current = await Invoice.findOne({ _id: id, type: PURCHASE_TYPE });
  if (!current) throw ApiError.notFound('Purchase invoice not found');

  // Reserve against GoodsPurchase first because it remains the accounting
  // source of truth. The matching invoice update then mirrors that reservation.
  const reservedPurchase = await GoodsPurchase.findOneAndUpdate(
    { _id: current.purchase, balance: { $gte: amt } },
    [
      {
        $set: {
          paid: { $add: ['$paid', amt] },
          balance: { $subtract: ['$balance', amt] },
        },
      },
    ],
    { returnDocument: 'after', updatePipeline: true },
  );
  if (!reservedPurchase) throw ApiError.badRequest('Amount exceeds the purchase invoice balance');

  const reserved = await Invoice.findOneAndUpdate(
    { _id: id, type: PURCHASE_TYPE, purchase: current.purchase },
    [
      {
        $set: {
          paid: { $add: ['$paid', amt] },
          balance: { $subtract: ['$balance', amt] },
          status: {
            $cond: [{ $lte: [{ $subtract: ['$balance', amt] }, 0] }, 'PAID', 'PARTIAL'],
          },
        },
      },
    ],
    { returnDocument: 'after', updatePipeline: true },
  );
  if (!reserved) {
    await GoodsPurchase.findByIdAndUpdate(
      current.purchase,
      [
        {
          $set: {
            paid: { $subtract: ['$paid', amt] },
            balance: { $add: ['$balance', amt] },
          },
        },
      ],
      { updatePipeline: true },
    );
    throw ApiError.conflict('Purchase invoice could not be synchronized; please try again');
  }

  try {
    await paymentService.payVendor(actor, {
      vendor: reservedPurchase.vendor,
      amount,
      method,
      bankAccount,
      date,
      note: note || `Payment for ${reserved.vendorInvoiceNo || reserved.number}`,
    });
  } catch (error) {
    await rollbackInvoicePayment(id, current.purchase, amt);
    throw error;
  }

  return getPurchaseInvoiceById(id);
}

module.exports = {
  createFromPurchase,
  payPurchaseInvoice,
  listPurchaseInvoices,
  getPurchaseInvoiceById,
  backfillPurchaseInvoices,
};
