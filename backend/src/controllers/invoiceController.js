const invoiceService = require('../services/invoiceService');
const { streamInvoicePdf } = require('../services/invoicePdfService');
const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/ApiResponse');
const { view } = require('../utils/money');

const out = (i) => (i && i.toJSON ? i.toJSON() : i);

// Internal status -> the vocabulary the client renders (PAID / PARTIALLY_PAID /
// ISSUED).
const STATUS_VIEW = { PAID: 'PAID', PARTIAL: 'PARTIALLY_PAID', UNPAID: 'ISSUED' };

function serialize(invoice) {
  const i = view(out(invoice), [
    'subtotal',
    'discount',
    'tax',
    'total',
    'cost',
    'amountPaid',
    'balance',
  ]);
  if (Array.isArray(i.items)) {
    i.items = i.items.map((it) => view(it, ['unitPrice', 'lineTotal', 'cost']));
  }

  // `customer` may be a populated object (single fetch), a bare id (list), or
  // null (walk-in). Expose a stable `customerId` plus a `{ name }` object.
  const cust = i.customer;
  if (cust && typeof cust === 'object') {
    i.customerId = String(cust._id ?? cust.id);
    i.customer = { ...cust, name: cust.name || i.customerName };
  } else {
    i.customerId = cust ? String(cust) : undefined;
    i.customer = { name: i.customerName };
  }

  // Field-name aliases the client expects (rupee values already applied above).
  i.invoiceNumber = i.number;
  i.issueDate = i.date;
  i.paidAmount = i.amountPaid;
  i.grandTotal = i.total;
  i.taxTotal = i.tax;
  i.discountTotal = i.discount;
  i.saleId = i.sale ? String(i.sale._id ?? i.sale) : undefined;
  i.status = STATUS_VIEW[i.status] || i.status;
  return i;
}

const createInvoice = asyncHandler(async (req, res) => {
  // The POS bills an existing sale (`{ saleId }`); everything else builds a
  // stand-alone credit invoice from `items[]`.
  const invoice = req.body.saleId
    ? await invoiceService.createFromSale(req.user, req.body.saleId)
    : await invoiceService.createInvoice(req.user, req.body);
  return sendSuccess(res, 201, 'Invoice created', { invoice: serialize(invoice) });
});

const payInvoice = asyncHandler(async (req, res) => {
  const invoice = await invoiceService.payInvoice(req.user, req.params.id, req.body);
  return sendSuccess(res, 200, 'Payment recorded', { invoice: serialize(invoice) });
});

const listInvoices = asyncHandler(async (req, res) => {
  const { page, limit, customer, status, from, to } = req.query;
  const result = await invoiceService.listInvoices({ page, limit, customer, status, from, to });
  return sendSuccess(res, 200, 'Invoices fetched', {
    ...result,
    invoices: result.invoices.map(serialize),
  });
});

const getInvoice = asyncHandler(async (req, res) => {
  const invoice = await invoiceService.getInvoiceById(req.params.id);
  return sendSuccess(res, 200, 'Invoice fetched', { invoice: serialize(invoice) });
});

// GET /api/invoices/:id/pdf — streams the invoice as a downloadable PDF.
// Note: this returns a PDF binary, not the standard JSON envelope.
const downloadInvoicePdf = asyncHandler(async (req, res) => {
  const invoice = await invoiceService.getInvoiceById(req.params.id);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${invoice.number}.pdf"`);
  // Await so a generation failure before streaming starts propagates to the
  // error handler instead of leaving the request hanging.
  await streamInvoicePdf(invoice, res);
});

module.exports = { createInvoice, payInvoice, listInvoices, getInvoice, downloadInvoicePdf };
