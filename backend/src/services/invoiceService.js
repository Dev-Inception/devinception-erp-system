const { Op } = require('sequelize');
const { initializeModels } = require('../db/models');
const { getPostgres } = require('../db/postgres');
const ApiError = require('../utils/ApiError');
const { toPaisa } = require('../utils/money');
const { parsePagination } = require('../utils/query');
const paymentService = require('./paymentService');
const gatePassService = require('./gatePassService');

const { Invoice, InvoiceItem, GoodsPurchase, GoodsPurchaseItem, Vendor, Warehouse } =
  initializeModels();
const PURCHASE_TYPE = 'PURCHASE';

function paymentStatus(total, paid, balance) {
  if (balance <= 0 || total <= paid) return 'PAID';
  if (paid > 0) return 'PARTIAL';
  return 'UNPAID';
}

function purchaseSnapshot(purchase) {
  return {
    type: PURCHASE_TYPE,
    purchase: purchase.id,
    number: purchase.number,
    vendorInvoiceNo: purchase.vendorInvoiceNo || '',
    vendor: purchase.vendor,
    vendorName: purchase.vendorName || '',
    warehouse: purchase.warehouse,
    date: purchase.date,
    subtotal: purchase.subtotal,
    discount: purchase.discount || 0,
    tax: purchase.tax || 0,
    total: purchase.total,
    paid: purchase.paid || 0,
    balance: purchase.balance,
    status: paymentStatus(purchase.total, purchase.paid || 0, purchase.balance),
    notes: purchase.notes || '',
    createdBy: purchase.createdBy || null,
  };
}

function shapeInvoice(invoice) {
  const value = invoice.toJSON();
  value.vendor = invoice.vendorInfo ? invoice.vendorInfo.toJSON() : value.vendor;
  value.warehouse = invoice.warehouseInfo ? invoice.warehouseInfo.toJSON() : value.warehouse;
  value.items = (invoice.items || []).map((item) => item.toJSON());
  delete value.vendorInfo;
  delete value.warehouseInfo;
  return value;
}

async function populatedInvoice(id, transaction = null) {
  const invoice = await Invoice.findOne({
    where: { id, type: PURCHASE_TYPE },
    include: [
      { model: InvoiceItem, as: 'items' },
      { model: Vendor, as: 'vendorInfo' },
      { model: Warehouse, as: 'warehouseInfo' },
    ],
    order: [[{ model: InvoiceItem, as: 'items' }, 'position', 'ASC']],
    transaction,
  });
  return invoice ? shapeInvoice(invoice) : null;
}

async function persistPurchaseInvoice(purchase, transaction) {
  const snapshot = purchaseSnapshot(purchase);
  let invoice = await Invoice.findOne({ where: { purchase: purchase.id }, transaction });
  if (invoice) {
    await invoice.update(snapshot, { transaction });
    await InvoiceItem.destroy({ where: { invoiceId: invoice.id }, transaction });
  } else {
    invoice = await Invoice.create(snapshot, { transaction });
  }
  await InvoiceItem.bulkCreate(
    (purchase.items || []).map((item, position) => ({
      invoiceId: invoice.id,
      position,
      product: item.product,
      name: item.name,
      quantity: item.quantity,
      unitCost: item.unitCost,
      taxPercent: item.taxPercent || 0,
      tax: item.tax || 0,
      lineTotal: item.lineTotal,
    })),
    { transaction, validate: true },
  );
  return invoice;
}

async function purchaseWithItems(purchaseId, transaction, lock = false) {
  return GoodsPurchase.findByPk(purchaseId, {
    include: [{ model: GoodsPurchaseItem, as: 'items' }],
    transaction,
    ...(lock ? { lock: transaction.LOCK.UPDATE } : {}),
  });
}

async function createFromPurchase(purchaseId, outerTransaction = null) {
  const write = async (transaction) => {
    const purchase = await purchaseWithItems(purchaseId, transaction);
    if (!purchase) throw ApiError.notFound('Purchase not found');
    const invoice = await persistPurchaseInvoice(purchase, transaction);
    return populatedInvoice(invoice.id, transaction);
  };
  if (outerTransaction) return write(outerTransaction);
  return getPostgres().transaction(write);
}

async function backfillPurchaseInvoices() {
  const existing = await Invoice.findAll({ attributes: ['purchase'], raw: true });
  const where = existing.length ? { id: { [Op.notIn]: existing.map((row) => row.purchase) } } : {};
  const missing = await GoodsPurchase.findAll({
    where,
    include: [{ model: GoodsPurchaseItem, as: 'items' }],
  });
  for (const purchase of missing) await createFromPurchase(purchase.id);
}

async function listPurchaseInvoices({ vendor, status, from, to, ...query } = {}) {
  await backfillPurchaseInvoices();
  const { page, limit, skip } = parsePagination(query);
  const where = { type: PURCHASE_TYPE };
  if (vendor) where.vendor = vendor;
  if (status) where.status = status;
  if (from || to) {
    where.date = {};
    if (from) where.date[Op.gte] = new Date(from);
    if (to) where.date[Op.lte] = new Date(to);
  }
  const [invoices, total] = await Promise.all([
    Invoice.findAll({
      where,
      include: [
        { model: InvoiceItem, as: 'items' },
        { model: Vendor, as: 'vendorInfo' },
        { model: Warehouse, as: 'warehouseInfo' },
      ],
      order: [
        ['date', 'DESC'],
        ['createdAt', 'DESC'],
      ],
      offset: skip,
      limit,
    }),
    Invoice.count({ where }),
  ]);
  return { invoices: invoices.map(shapeInvoice), total, page, limit };
}

async function getPurchaseInvoiceById(id) {
  const invoice = await populatedInvoice(id);
  if (!invoice) throw ApiError.notFound('Purchase invoice not found');
  if (!invoice.gatePass) {
    const gatePass = await gatePassService.getGatePassByPurchase(invoice.purchase);
    invoice.gatePass = gatePass._id || gatePass.id;
  }
  return invoice;
}

async function payPurchaseInvoice(actor, id, { amount, method, bankAccount, date, note }) {
  const amt = toPaisa(amount);
  if (amt <= 0) throw ApiError.badRequest('Amount must be positive');

  await getPostgres().transaction(async (transaction) => {
    const invoice = await Invoice.findByPk(id, {
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!invoice || invoice.type !== PURCHASE_TYPE) {
      throw ApiError.notFound('Purchase invoice not found');
    }
    const purchase = await GoodsPurchase.findByPk(invoice.purchase, {
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!purchase || purchase.balance < amt) {
      throw ApiError.badRequest('Amount exceeds the purchase invoice balance');
    }

    await paymentService.payVendor(actor, {
      vendor: purchase.vendor,
      amount,
      method,
      bankAccount,
      date,
      note: note || `Payment for ${invoice.vendorInvoiceNo || invoice.number}`,
      transaction,
    });
    purchase.paid += amt;
    purchase.balance -= amt;
    invoice.paid += amt;
    invoice.balance -= amt;
    invoice.status = paymentStatus(invoice.total, invoice.paid, invoice.balance);
    await Promise.all([purchase.save({ transaction }), invoice.save({ transaction })]);
  });
  return getPurchaseInvoiceById(id);
}

module.exports = {
  createFromPurchase,
  payPurchaseInvoice,
  listPurchaseInvoices,
  getPurchaseInvoiceById,
  backfillPurchaseInvoices,
};
