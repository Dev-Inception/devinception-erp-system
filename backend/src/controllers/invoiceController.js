const invoiceService = require('../services/invoiceService');
const settingsService = require('../services/settingsService');
const { streamInvoicePdf } = require('../services/invoicePdfService');
const { serializeInvoice } = require('../serializers/invoiceSerializer');
const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/ApiResponse');

const createInvoice = asyncHandler(async (req, res) => {
  // The POS bills an existing sale (`{ saleId }`); everything else builds a
  // stand-alone credit invoice from `items[]`.
  const invoice = req.body.saleId
    ? await invoiceService.createFromSale(req.user, req.body.saleId)
    : await invoiceService.createInvoice(req.user, req.body);
  return sendSuccess(res, 201, 'Invoice created', { invoice: serializeInvoice(invoice) });
});

const payInvoice = asyncHandler(async (req, res) => {
  const invoice = await invoiceService.payInvoice(req.user, req.params.id, req.body);
  return sendSuccess(res, 200, 'Payment recorded', { invoice: serializeInvoice(invoice) });
});

const listInvoices = asyncHandler(async (req, res) => {
  const { page, limit, customer, status, from, to } = req.query;
  const result = await invoiceService.listInvoices({ page, limit, customer, status, from, to });
  return sendSuccess(res, 200, 'Invoices fetched', {
    ...result,
    invoices: result.invoices.map(serializeInvoice),
  });
});

const getInvoice = asyncHandler(async (req, res) => {
  const invoice = await invoiceService.getInvoiceById(req.params.id);
  return sendSuccess(res, 200, 'Invoice fetched', { invoice: serializeInvoice(invoice) });
});

// GET /api/invoices/:id/pdf — streams the invoice as a downloadable PDF.
// Note: this returns a PDF binary, not the standard JSON envelope.
const downloadInvoicePdf = asyncHandler(async (req, res) => {
  const [invoice, settings] = await Promise.all([
    invoiceService.getInvoiceById(req.params.id),
    settingsService.getSettings(),
  ]);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${invoice.number}.pdf"`);
  res.setHeader('Cache-Control', 'private, no-store');
  // Await so a generation failure before streaming starts propagates to the
  // error handler instead of leaving the request hanging.
  await streamInvoicePdf(invoice, res, settings.toObject ? settings.toObject() : settings);
});

module.exports = { createInvoice, payInvoice, listInvoices, getInvoice, downloadInvoicePdf };
