const Invoice = require('../models/invoiceModel');
const Customer = require('../models/customerModel');
const Product = require('../models/productModel');
const Sale = require('../models/saleModel');
const StockLevel = require('../models/stockLevelModel');
const ApiError = require('../utils/ApiError');
const { toPaisa } = require('../utils/money');
const { ACCOUNT, REF } = require('../utils/finance');
const journalService = require('./journalService');
const stockService = require('./stockService');
const paymentService = require('./paymentService');
const counterService = require('./counterService');
const { parsePagination } = require('../utils/query');

/**
 * Customer invoices. Issuing an invoice lowers stock (capturing COGS) and posts
 * Dr Receivable / Cr Sales (+ Cr Tax). Payments are recorded through the
 * standard customer-receipt flow and tracked per invoice, deriving the
 * UNPAID / PARTIAL / PAID status.
 */

function statusFor(total, paid) {
  if (paid <= 0) return 'UNPAID';
  if (paid >= total) return 'PAID';
  return 'PARTIAL';
}

async function createInvoice(actor, input) {
  const { customer, warehouse, date, dueDate, items, discount = 0, taxPercent = 0, notes } = input;

  const customerDoc = await Customer.findById(customer);
  if (!customerDoc) throw ApiError.notFound('Customer not found');

  if (!Array.isArray(items) || items.length === 0) {
    throw ApiError.badRequest('At least one item is required');
  }

  const wh = warehouse
    ? await require('./warehouseService').getWarehouseById(warehouse)
    : await stockService.ensureDefaultWarehouse();

  // Build lines and pre-check stock.
  let subtotal = 0;
  const lineItems = [];
  for (const it of items) {
    const product = await Product.findById(it.product);
    if (!product) throw ApiError.notFound(`Product not found: ${it.product}`);
    const quantity = Number(it.quantity);
    if (!(quantity > 0)) throw ApiError.badRequest('Item quantity must be positive');
    const unitPrice = it.unitPrice !== undefined ? toPaisa(it.unitPrice) : product.salePrice;
    const lineTotal = Math.round(quantity * unitPrice);
    subtotal += lineTotal;

    const level = await StockLevel.findOne({ product: product._id, warehouse: wh._id });
    if (!level || level.quantity < quantity) {
      throw ApiError.badRequest(`Insufficient stock for ${product.name}`);
    }
    lineItems.push({ product: product._id, name: product.name, quantity, unitPrice, lineTotal });
  }

  const discountPaisa = toPaisa(discount);
  if (discountPaisa > subtotal) throw ApiError.badRequest('Discount cannot exceed the subtotal');
  const net = subtotal - discountPaisa;
  const taxPct = Number(taxPercent) || 0;
  const tax = Math.round((net * taxPct) / 100);
  const total = net + tax;

  const when = date ? new Date(date) : new Date();
  const number = await counterService.nextDocNumber('INV', when.getFullYear(), 6);

  // Issue stock + capture COGS.
  let cost = 0;
  for (const li of lineItems) {
    const lineCost = await stockService.issueStock(li.product, wh._id, li.quantity, {
      refType: REF.SALE,
      refNo: number,
      date: when,
    });
    li.cost = lineCost;
    cost += lineCost;
  }

  const invoice = await Invoice.create({
    number,
    customer: customerDoc._id,
    customerName: customerDoc.name,
    warehouse: wh._id,
    date: when,
    dueDate: dueDate ? new Date(dueDate) : null,
    items: lineItems,
    subtotal,
    discount: discountPaisa,
    taxPercent: taxPct,
    tax,
    total,
    cost,
    amountPaid: 0,
    balance: total,
    status: 'UNPAID',
    notes: notes || '',
    createdBy: actor ? actor._id : null,
  });

  // Receivable: Dr A-R / Cr Sales (+ Cr Tax).
  const lines = [journalService.line(ACCOUNT.AR, { debit: total, ref: customerDoc._id })];
  lines.push(journalService.line(ACCOUNT.SALES, { credit: net }));
  if (tax > 0) lines.push(journalService.line(ACCOUNT.TAX, { credit: tax }));
  await journalService.post({
    date: when,
    description: `Invoice ${number}`,
    refType: REF.SALE,
    refId: invoice._id,
    refNo: number,
    createdBy: actor ? actor._id : null,
    lines,
  });

  // Cost of goods sold.
  if (cost > 0) {
    await journalService.post({
      date: when,
      description: `COGS ${number}`,
      refType: REF.SALE,
      refId: invoice._id,
      refNo: number,
      createdBy: actor ? actor._id : null,
      lines: [
        journalService.line(ACCOUNT.COGS, { debit: cost }),
        journalService.line(ACCOUNT.INVENTORY, { credit: cost }),
      ],
    });
  }

  return invoice;
}

/**
 * Create an invoice **from an existing sale** — a billing document for a sale
 * that has already moved stock and posted revenue. It copies the sale's
 * totals, customer and lines and posts **no** new stock or ledger entries
 * (that would double-count), so it is purely a printable record. Idempotent:
 * if the sale already has an invoice, that invoice is returned unchanged.
 */
async function createFromSale(actor, saleId) {
  const sale = await Sale.findById(saleId);
  if (!sale) throw ApiError.notFound('Sale not found');

  const existing = await Invoice.findOne({ sale: sale._id });
  if (existing) return existing;

  // What the customer has already paid on the sale (cash + online); the credit
  // portion, if any, is still outstanding.
  const amountPaid = (sale.cashAmount || 0) + (sale.onlineAmount || 0);
  const total = sale.total;
  const items = (sale.items || []).map((it) => ({
    product: it.product,
    name: it.name,
    quantity: it.quantity,
    unitPrice: it.unitPrice,
    lineTotal: it.lineTotal,
    cost: it.cost || 0,
  }));

  const when = new Date();
  const number = await counterService.nextDocNumber('INV', when.getFullYear(), 6);

  try {
    const invoice = await Invoice.create({
      number,
      sale: sale._id,
      customer: sale.customer || null,
      customerName: sale.customerName || 'Walk-in',
      warehouse: sale.warehouse,
      date: when,
      items,
      subtotal: sale.subtotal,
      discount: sale.discount,
      taxPercent: sale.taxPercent,
      tax: sale.tax,
      total,
      cost: sale.cost,
      amountPaid,
      balance: total - amountPaid,
      status: statusFor(total, amountPaid),
      createdBy: actor ? actor._id : null,
    });
    return invoice;
  } catch (err) {
    // A concurrent request may have created the sale's invoice between our
    // check and insert; the unique index turns that into a duplicate-key
    // error. Return the now-existing invoice so the call stays idempotent.
    if (err && err.code === 11000) {
      const inv = await Invoice.findOne({ sale: sale._id });
      if (inv) return inv;
    }
    throw err;
  }
}

// Record a payment against an invoice (Dr Cash/Bank / Cr A-R via the receipt
// flow) and advance its status.
async function payInvoice(actor, id, { amount, method, bankAccount, date, note }) {
  const invoice = await Invoice.findById(id);
  if (!invoice) throw ApiError.notFound('Invoice not found');

  const amt = toPaisa(amount);
  if (amt <= 0) throw ApiError.badRequest('Amount must be positive');
  if (amt > invoice.balance) throw ApiError.badRequest('Amount exceeds the invoice balance');

  await paymentService.receiveFromCustomer(actor, {
    customer: invoice.customer,
    amount,
    method,
    bankAccount,
    date,
    note: note || `Payment for ${invoice.number}`,
  });

  invoice.amountPaid += amt;
  invoice.balance = invoice.total - invoice.amountPaid;
  invoice.status = statusFor(invoice.total, invoice.amountPaid);
  await invoice.save();
  return invoice;
}

async function listInvoices({ customer, status, from, to, ...query } = {}) {
  const { page, limit, skip } = parsePagination(query);
  const filter = {};
  if (customer) filter.customer = customer;
  if (status) filter.status = status;
  if (from || to) {
    filter.date = {};
    if (from) filter.date.$gte = new Date(from);
    if (to) filter.date.$lte = new Date(to);
  }

  const [invoices, total] = await Promise.all([
    Invoice.find(filter).sort({ date: -1, createdAt: -1 }).skip(skip).limit(limit),
    Invoice.countDocuments(filter),
  ]);
  return { invoices, total, page, limit };
}

async function getInvoiceById(id) {
  const invoice = await Invoice.findById(id)
    .populate('customer', 'name phone email')
    .populate('warehouse', 'name');
  if (!invoice) throw ApiError.notFound('Invoice not found');
  return invoice;
}

module.exports = { createInvoice, createFromSale, payInvoice, listInvoices, getInvoiceById };
