const invoiceService = require('../services/invoiceService');
const settingsService = require('../services/settingsService');
const { streamInvoicePdf } = require('../services/invoicePdfService');
const { serializeInvoice } = require('../serializers/invoiceSerializer');
const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/ApiResponse');

const createInvoice = asyncHandler(async (req, res) => {
  const invoice = await invoiceService.createFromPurchase(req.body.purchaseId);
  return sendSuccess(res, 200, 'Purchase invoice fetched', { invoice: serializeInvoice(invoice) });
});

const payInvoice = asyncHandler(async (req, res) => {
  const invoice = await invoiceService.payPurchaseInvoice(req.user, req.params.id, req.body);
  return sendSuccess(res, 200, 'Payment recorded', { invoice: serializeInvoice(invoice) });
});

const listInvoices = asyncHandler(async (req, res) => {
  const { page, limit, vendor, status, from, to } = req.query;
  const result = await invoiceService.listPurchaseInvoices({
    page,
    limit,
    vendor,
    status,
    from,
    to,
  });
  return sendSuccess(res, 200, 'Invoices fetched', {
    ...result,
    invoices: result.invoices.map(serializeInvoice),
  });
});

const getInvoice = asyncHandler(async (req, res) => {
  const invoice = await invoiceService.getPurchaseInvoiceById(req.params.id);
  return sendSuccess(res, 200, 'Invoice fetched', { invoice: serializeInvoice(invoice) });
});

// GET /api/invoices/:id/pdf — streams the invoice as a downloadable PDF.
// Note: this returns a PDF binary, not the standard JSON envelope.
const downloadInvoicePdf = asyncHandler(async (req, res) => {
  const [invoice, settings] = await Promise.all([
    invoiceService.getPurchaseInvoiceById(req.params.id),
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
