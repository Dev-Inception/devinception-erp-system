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
const { calculateInvoiceTotals, resolveUnitPrice } = require('./invoiceCalculationService');
const { parsePagination } = require('../utils/query');
const { normalizeQuantity, requirePositiveQuantity } = require('../utils/quantity');

/**
 * Customer invoices. Issuing an invoice lowers stock (capturing COGS) and posts
 * Dr Receivable / Cr Sales (+ Cr Tax). Payments are recorded through the
 * standard customer-receipt flow and tracked per invoice, deriving the
 * UNPAID / PARTIAL / PAID status.
 */

function statusFor(total, paid) {
  if (total <= 0 || paid >= total) return 'PAID';
  if (paid <= 0) return 'UNPAID';
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
  const unresolvedLines = [];
  const requestedByProduct = new Map();
  for (const it of items) {
    const product = await Product.findById(it.product);
    if (!product) throw ApiError.notFound(`Product not found: ${it.product}`);
    const quantity = requirePositiveQuantity(it.quantity, 'Item quantity must be positive');
    const unitPrice = resolveUnitPrice(it.unitPrice, product.salePrice);

    const productKey = String(product._id);
    const requested = requirePositiveQuantity(
      (requestedByProduct.get(productKey) || 0) + quantity,
      'Requested item quantity is too large',
    );
    requestedByProduct.set(productKey, requested);
    const level = await StockLevel.findOne({ product: product._id, warehouse: wh._id });
    const available = level ? normalizeQuantity(level.quantity) : Number.NaN;
    if (!Number.isFinite(available) || available < requested) {
      throw ApiError.badRequest(`Insufficient stock for ${product.name}`);
    }
    unresolvedLines.push({ product: product._id, name: product.name, quantity, unitPrice });
  }

  const calculated = calculateInvoiceTotals(unresolvedLines, { discount, taxPercent });
  const lineItems = calculated.items;
  const {
    subtotal,
    discount: discountPaisa,
    taxableAmount: net,
    taxPercent: taxPct,
    tax,
    total,
  } = calculated;

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
    status: statusFor(total, 0),
    notes: notes || '',
    createdBy: actor ? actor._id : null,
  });

  // Receivable: Dr A-R / Cr Sales (+ Cr Tax).
  if (total > 0) {
    const lines = [journalService.line(ACCOUNT.AR, { debit: total, ref: customerDoc._id })];
    if (net > 0) lines.push(journalService.line(ACCOUNT.SALES, { credit: net }));
    if (tax > 0) lines.push(journalService.line(ACCOUNT.TAX, { credit: tax }));
    await journalService.post({
      date: when,
      description: `Invoice ${number}`,
      refType: REF.SALE,
      refId: invoice._id,
      refNo: number,
      warehouse: wh._id,
      createdBy: actor ? actor._id : null,
      lines,
    });
  }

  // Cost of goods sold.
  if (cost > 0) {
    await journalService.post({
      date: when,
      description: `COGS ${number}`,
      refType: REF.SALE,
      refId: invoice._id,
      refNo: number,
      warehouse: wh._id,
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
  // Reserve the balance atomically. Two concurrent requests cannot both pay
  // against the same stale balance because only one conditional update can
  // consume the remaining amount.
  const reserved = await Invoice.findOneAndUpdate(
    { _id: id, balance: { $gte: amt } },
    [
      {
        $set: {
          amountPaid: { $add: ['$amountPaid', amt] },
          balance: { $subtract: ['$balance', amt] },
          status: {
            $cond: [{ $lte: [{ $subtract: ['$balance', amt] }, 0] }, 'PAID', 'PARTIAL'],
          },
        },
      },
    ],
    { new: true, updatePipeline: true },
  );
  if (!reserved) throw ApiError.badRequest('Amount exceeds the invoice balance');

  try {
    await paymentService.receiveFromCustomer(actor, {
      customer: reserved.customer,
      amount,
      method,
      bankAccount,
      date,
      note: note || `Payment for ${reserved.number}`,
    });
  } catch (error) {
    // Release the reservation if receipt posting fails. Derive status from the
    // then-current values so this remains correct if another payment completed
    // between the reservation and rollback.
    await Invoice.findByIdAndUpdate(
      id,
      [
        {
          $set: {
            amountPaid: { $subtract: ['$amountPaid', amt] },
            balance: { $add: ['$balance', amt] },
            status: {
              $cond: [
                { $lte: [{ $subtract: ['$amountPaid', amt] }, 0] },
                'UNPAID',
                {
                  $cond: [{ $lte: [{ $add: ['$balance', amt] }, 0] }, 'PAID', 'PARTIAL'],
                },
              ],
            },
          },
        },
      ],
      { updatePipeline: true },
    );
    throw error;
  }

  return Invoice.findById(id);
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
    Invoice.find(filter)
      .populate('customer', 'name phone email address')
      .populate('warehouse', 'name location address')
      .sort({ date: -1, createdAt: -1 })
      .skip(skip)
      .limit(limit),
    Invoice.countDocuments(filter),
  ]);
  return { invoices, total, page, limit };
}

async function getInvoiceById(id) {
  const invoice = await Invoice.findById(id)
    .populate('customer', 'name phone email address')
    .populate('warehouse', 'name location address');
  if (!invoice) throw ApiError.notFound('Invoice not found');
  return invoice;
}

module.exports = {
  createInvoice,
  createFromSale,
  payInvoice,
  listInvoices,
  getInvoiceById,
  statusFor,
};
