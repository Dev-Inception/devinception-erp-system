const invoiceService = require("../services/invoiceService");
const { streamInvoicePdf } = require("../services/invoicePdfService");
const asyncHandler = require("../utils/asyncHandler");
const { sendSuccess } = require("../utils/ApiResponse");
const { view } = require("../utils/money");

const out = (i) => (i && i.toJSON ? i.toJSON() : i);
function serialize(invoice) {
  const i = view(out(invoice), [
    "subtotal",
    "discount",
    "tax",
    "total",
    "cost",
    "amountPaid",
    "balance",
  ]);
  if (Array.isArray(i.items)) {
    i.items = i.items.map((it) => view(it, ["unitPrice", "lineTotal", "cost"]));
  }
  return i;
}

const createInvoice = asyncHandler(async (req, res) => {
  const invoice = await invoiceService.createInvoice(req.user, req.body);
  return sendSuccess(res, 201, "Invoice created", { invoice: serialize(invoice) });
});

const payInvoice = asyncHandler(async (req, res) => {
  const invoice = await invoiceService.payInvoice(req.user, req.params.id, req.body);
  return sendSuccess(res, 200, "Payment recorded", { invoice: serialize(invoice) });
});

const listInvoices = asyncHandler(async (req, res) => {
  const { page, limit, customer, status, from, to } = req.query;
  const result = await invoiceService.listInvoices({ page, limit, customer, status, from, to });
  return sendSuccess(res, 200, "Invoices fetched", {
    ...result,
    invoices: result.invoices.map(serialize),
  });
});

const getInvoice = asyncHandler(async (req, res) => {
  const invoice = await invoiceService.getInvoiceById(req.params.id);
  return sendSuccess(res, 200, "Invoice fetched", { invoice: serialize(invoice) });
});

// GET /api/invoices/:id/pdf — streams the invoice as a downloadable PDF.
// Note: this returns a PDF binary, not the standard JSON envelope.
const downloadInvoicePdf = asyncHandler(async (req, res) => {
  const invoice = await invoiceService.getInvoiceById(req.params.id);
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${invoice.number}.pdf"`);
  streamInvoicePdf(invoice, res);
});

module.exports = { createInvoice, payInvoice, listInvoices, getInvoice, downloadInvoicePdf };
