const GoodsPurchase = require('../models/goodsPurchaseModel');
const ApiError = require('../utils/ApiError');
const { toPaisa } = require('../utils/money');
const { parsePagination } = require('../utils/query');
const paymentService = require('./paymentService');

/**
 * Purchase-invoice API over GoodsPurchase, which remains the single persisted
 * source of truth for vendor, items, totals, and payment balance. No separate
 * invoice document is created or synchronized.
 */

function purchaseStatusFilter(status) {
  if (status === 'PAID') return { balance: { $lte: 0 } };
  if (status === 'PARTIAL') return { paid: { $gt: 0 }, balance: { $gt: 0 } };
  if (status === 'UNPAID') return { paid: { $lte: 0 }, balance: { $gt: 0 } };
  return {};
}

async function listPurchaseInvoices({ vendor, status, from, to, ...query } = {}) {
  const { page, limit, skip } = parsePagination(query);
  const filter = { ...purchaseStatusFilter(status) };
  if (vendor) filter.vendor = vendor;
  if (from || to) {
    filter.date = {};
    if (from) filter.date.$gte = new Date(from);
    if (to) filter.date.$lte = new Date(to);
  }

  const [invoices, total] = await Promise.all([
    GoodsPurchase.find(filter)
      .populate('vendor', 'name phone email address')
      .populate('warehouse', 'name location address')
      .sort({ date: -1, createdAt: -1 })
      .skip(skip)
      .limit(limit),
    GoodsPurchase.countDocuments(filter),
  ]);
  return { invoices, total, page, limit };
}

async function getPurchaseInvoiceById(id) {
  const invoice = await GoodsPurchase.findById(id)
    .populate('vendor', 'name phone email address')
    .populate('warehouse', 'name location address');
  if (!invoice) throw ApiError.notFound('Purchase invoice not found');
  return invoice;
}

// A goods purchase already is its invoice source. Return it idempotently.
async function createFromPurchase(purchaseId) {
  return getPurchaseInvoiceById(purchaseId);
}

// Pay a purchase invoice: reserve its balance, post the vendor payment, and
// roll the reservation back if ledger posting fails.
async function payPurchaseInvoice(actor, id, { amount, method, bankAccount, date, note }) {
  const amt = toPaisa(amount);
  if (amt <= 0) throw ApiError.badRequest('Amount must be positive');

  const reserved = await GoodsPurchase.findOneAndUpdate(
    { _id: id, balance: { $gte: amt } },
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
  if (!reserved) throw ApiError.badRequest('Amount exceeds the purchase invoice balance');

  try {
    await paymentService.payVendor(actor, {
      vendor: reserved.vendor,
      amount,
      method,
      bankAccount,
      date,
      note: note || `Payment for ${reserved.vendorInvoiceNo || reserved.number}`,
    });
  } catch (error) {
    await GoodsPurchase.findByIdAndUpdate(
      id,
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
    throw error;
  }

  return getPurchaseInvoiceById(id);
}

module.exports = {
  createFromPurchase,
  payPurchaseInvoice,
  listPurchaseInvoices,
  getPurchaseInvoiceById,
};
