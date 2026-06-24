const PDFDocument = require("pdfkit");
const env = require("../config/env");
const { toRupees } = require("../utils/money");

/**
 * Render an invoice document to a PDF and stream it into `res`. Everything on
 * the invoice is paisa; we convert to rupees only for display here. The caller
 * (controller) sets the HTTP headers; this just pipes the PDF bytes.
 */

const PAGE_MARGIN = 50;

// "Rs 1,200.00" from paisa.
function money(paisa) {
  const rupees = toRupees(paisa);
  return `Rs ${rupees.toLocaleString("en-PK", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDate(d) {
  if (!d) return "—";
  const dt = new Date(d);
  // YYYY-MM-DD, locale-independent so the PDF is stable across servers.
  return dt.toISOString().slice(0, 10);
}

// Draw one row of the items table at vertical position `y`; returns the next y.
function drawRow(doc, y, cols, { bold = false } = {}) {
  doc.font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(10);
  doc.text(cols.name, PAGE_MARGIN, y, { width: 230 });
  doc.text(cols.qty, 290, y, { width: 50, align: "right" });
  doc.text(cols.rate, 350, y, { width: 90, align: "right" });
  doc.text(cols.amount, 450, y, { width: 95, align: "right" });
  return y + 22;
}

/**
 * @param {object} invoice  Mongoose invoice doc, ideally with `customer`
 *                          populated (name/phone/email) and `warehouse` (name).
 * @param {Writable} res    The HTTP response (or any writable stream).
 */
function streamInvoicePdf(invoice, res) {
  const doc = new PDFDocument({ size: "A4", margin: PAGE_MARGIN });
  doc.pipe(res);

  const customerName =
    invoice.customerName || (invoice.customer && invoice.customer.name) || "Customer";

  // ---- Header: company (left) + INVOICE meta (right) ----
  doc.font("Helvetica-Bold").fontSize(20).text(env.company.name, PAGE_MARGIN, PAGE_MARGIN);
  doc.font("Helvetica").fontSize(9).fillColor("#555");
  if (env.company.address) doc.text(env.company.address);
  if (env.company.phone) doc.text(env.company.phone);
  doc.fillColor("#000");

  doc.font("Helvetica-Bold").fontSize(18).text("INVOICE", 0, PAGE_MARGIN, { align: "right" });
  doc.font("Helvetica").fontSize(10).fillColor("#555");
  doc.text(`# ${invoice.number}`, { align: "right" });
  doc.text(`Date: ${formatDate(invoice.date)}`, { align: "right" });
  if (invoice.dueDate) doc.text(`Due: ${formatDate(invoice.dueDate)}`, { align: "right" });
  doc.text(`Status: ${invoice.status}`, { align: "right" });
  doc.fillColor("#000");

  // ---- Bill-to ----
  let y = 150;
  doc.font("Helvetica-Bold").fontSize(11).text("Bill To", PAGE_MARGIN, y);
  doc.font("Helvetica").fontSize(10).fillColor("#333");
  y += 16;
  doc.text(customerName, PAGE_MARGIN, y);
  if (invoice.customer && invoice.customer.phone) doc.text(invoice.customer.phone);
  if (invoice.customer && invoice.customer.email) doc.text(invoice.customer.email);
  doc.fillColor("#000");

  // ---- Items table ----
  y = 235;
  doc.moveTo(PAGE_MARGIN, y - 6).lineTo(545, y - 6).strokeColor("#ccc").stroke();
  y = drawRow(doc, y, { name: "Item", qty: "Qty", rate: "Rate", amount: "Amount" }, { bold: true });
  doc.moveTo(PAGE_MARGIN, y - 4).lineTo(545, y - 4).strokeColor("#ccc").stroke();

  for (const it of invoice.items || []) {
    y = drawRow(doc, y, {
      name: it.name,
      qty: String(it.quantity),
      rate: money(it.unitPrice),
      amount: money(it.lineTotal),
    });
    // Simple page-break guard for long invoices.
    if (y > 720) {
      doc.addPage();
      y = PAGE_MARGIN;
    }
  }

  // ---- Totals ----
  doc.moveTo(300, y).lineTo(545, y).strokeColor("#ccc").stroke();
  y += 10;
  const totalLine = (label, value, bold = false) => {
    doc.font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(bold ? 12 : 10);
    doc.text(label, 300, y, { width: 140, align: "right" });
    doc.text(value, 450, y, { width: 95, align: "right" });
    y += bold ? 22 : 18;
  };
  totalLine("Subtotal", money(invoice.subtotal));
  if (invoice.discount > 0) totalLine("Discount", `- ${money(invoice.discount)}`);
  if (invoice.tax > 0) totalLine(`Tax (${invoice.taxPercent || 0}%)`, money(invoice.tax));
  totalLine("Total", money(invoice.total), true);
  if (invoice.amountPaid > 0) {
    totalLine("Paid", money(invoice.amountPaid));
    totalLine("Balance", money(invoice.balance), true);
  }

  // ---- Notes / footer ----
  if (invoice.notes) {
    y += 14;
    doc.font("Helvetica-Bold").fontSize(10).text("Notes", PAGE_MARGIN, y);
    doc.font("Helvetica").fontSize(9).fillColor("#444").text(invoice.notes, PAGE_MARGIN, y + 14, { width: 480 });
    doc.fillColor("#000");
  }

  doc
    .font("Helvetica")
    .fontSize(8)
    .fillColor("#999")
    .text("Thank you for your business.", PAGE_MARGIN, 790, { align: "center", width: 495 });

  doc.end();
}

module.exports = { streamInvoicePdf };
