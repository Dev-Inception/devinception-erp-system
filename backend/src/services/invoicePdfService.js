const PDFDocument = require('pdfkit');
const { toRupees } = require('../utils/money');

/**
 * Render a GoodsPurchase as a purchase-invoice PDF. Everything on the purchase
 * is paisa; we convert to rupees only for display here. The controller sets the
 * HTTP headers; this service only renders and streams the document.
 */

const PAGE_MARGIN = 50;
const CONTENT_BOTTOM_MARGIN = 80;

// "PKR 1,200.00" (or the configured currency) from paisa.
function money(paisa, currency) {
  const rupees = toRupees(paisa);
  const amount = rupees.toLocaleString('en-PK', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${currency || 'PKR'} ${amount}`;
}

function formatDate(d) {
  if (!d) return '—';
  const dt = new Date(d);
  // YYYY-MM-DD, locale-independent so the PDF is stable across servers.
  return dt.toISOString().slice(0, 10);
}

// Draw one row of the items table at vertical position `y`; returns the next y.
function drawRow(doc, y, cols, { bold = false, height = 22 } = {}) {
  doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(10);
  doc.text(cols.name, PAGE_MARGIN, y, { width: 230, height: height - 4, ellipsis: true });
  doc.text(cols.qty, 290, y, { width: 50, align: 'right' });
  doc.text(cols.rate, 350, y, { width: 90, align: 'right' });
  doc.text(cols.amount, 450, y, { width: 95, align: 'right' });
  return y + height;
}

function contentBottom(doc) {
  return doc.page.height - CONTENT_BOTTOM_MARGIN;
}

function drawTableHeader(doc, y) {
  doc
    .moveTo(PAGE_MARGIN, y - 6)
    .lineTo(545, y - 6)
    .strokeColor('#ccc')
    .stroke();
  const nextY = drawRow(
    doc,
    y,
    { name: 'Item', qty: 'Qty', rate: 'Rate', amount: 'Amount' },
    { bold: true },
  );
  doc
    .moveTo(PAGE_MARGIN, nextY - 4)
    .lineTo(545, nextY - 4)
    .strokeColor('#ccc')
    .stroke();
  return nextY;
}

function addContentPage(doc, { tableHeader = false } = {}) {
  doc.addPage();
  return tableHeader ? drawTableHeader(doc, PAGE_MARGIN) : PAGE_MARGIN;
}

function drawFooters(doc) {
  const range = doc.bufferedPageRange();
  for (let offset = 0; offset < range.count; offset += 1) {
    doc.switchToPage(range.start + offset);
    doc
      .font('Helvetica')
      .fontSize(8)
      .fillColor('#999')
      .text(
        `Thank you for your business.  •  Page ${offset + 1} of ${range.count}`,
        PAGE_MARGIN,
        doc.page.height - 65,
        { align: 'center', width: 495, lineBreak: false },
      );
  }
  doc.fillColor('#000');
}

// Draw the whole invoice onto an open PDFKit document. Kept separate from the
// streaming lifecycle so streamInvoicePdf can wrap it in error handling.
function renderInvoice(doc, invoice, company = {}) {
  const vendor = invoice.vendor;
  const vendorName = invoice.vendorName || (vendor && vendor.name) || 'Vendor';
  const paid = invoice.paid || 0;
  const status = invoice.balance <= 0 ? 'PAID' : paid > 0 ? 'PARTIAL' : 'UNPAID';
  const currency = company.currency || 'PKR';

  // ---- Header: company (left) + INVOICE meta (right) ----
  doc
    .font('Helvetica-Bold')
    .fontSize(20)
    .text(company.companyName || 'Company', PAGE_MARGIN, PAGE_MARGIN);
  doc.font('Helvetica').fontSize(9).fillColor('#555');
  if (company.address) doc.text(company.address);
  if (company.phone) doc.text(company.phone);
  if (company.email) doc.text(company.email);
  if (company.taxNumber) doc.text(`Tax No: ${company.taxNumber}`);
  doc.fillColor('#000');

  doc
    .font('Helvetica-Bold')
    .fontSize(18)
    .text('PURCHASE INVOICE', 0, PAGE_MARGIN, { align: 'right' });
  doc.font('Helvetica').fontSize(10).fillColor('#555');
  doc.text(`# ${invoice.vendorInvoiceNo || invoice.number}`, {
    align: 'right',
  });
  if (invoice.vendorInvoiceNo) {
    doc.text(`Purchase: ${invoice.number}`, { align: 'right' });
  }
  doc.text(`Date: ${formatDate(invoice.date)}`, { align: 'right' });
  if (invoice.dueDate) doc.text(`Due: ${formatDate(invoice.dueDate)}`, { align: 'right' });
  doc.text(`Status: ${status}`, { align: 'right' });
  if (invoice.warehouse && invoice.warehouse.name) {
    doc.text(`Warehouse: ${invoice.warehouse.name}`, { align: 'right' });
    if (invoice.warehouse.location) {
      doc.text(`Location: ${invoice.warehouse.location}`, { align: 'right' });
    }
    if (invoice.warehouse.address) {
      doc.text(`Address: ${invoice.warehouse.address}`, { align: 'right' });
    }
  }
  doc.fillColor('#000');

  // ---- Vendor ----
  let y = Math.max(150, doc.y + 12);
  doc.font('Helvetica-Bold').fontSize(11).text('Vendor', PAGE_MARGIN, y);
  doc.font('Helvetica').fontSize(10).fillColor('#333');
  y += 16;
  doc.text(vendorName, PAGE_MARGIN, y);
  if (vendor && vendor.phone) doc.text(vendor.phone);
  if (vendor && vendor.email) doc.text(vendor.email);
  if (vendor && vendor.address) doc.text(vendor.address);
  doc.fillColor('#000');

  // ---- Items table ----
  y = Math.max(235, doc.y + 24);
  y = drawTableHeader(doc, y);

  for (const it of invoice.items || []) {
    doc.font('Helvetica').fontSize(10);
    const rowHeight = Math.max(
      22,
      Math.ceil(doc.heightOfString(it.name || '', { width: 230 })) + 6,
    );
    if (y + rowHeight > contentBottom(doc)) y = addContentPage(doc, { tableHeader: true });
    y = drawRow(
      doc,
      y,
      {
        name: it.name,
        qty: String(it.quantity),
        rate: money(it.unitCost, currency),
        amount: money(it.lineTotal, currency),
      },
      { height: rowHeight },
    );
  }

  // ---- Totals ----
  const totalsHeight =
    10 +
    18 +
    (invoice.discount > 0 ? 36 : 0) +
    (invoice.tax > 0 ? 18 : 0) +
    22 +
    (paid > 0 ? 40 : 0);
  if (y + totalsHeight > contentBottom(doc)) y = addContentPage(doc);
  doc.moveTo(300, y).lineTo(545, y).strokeColor('#ccc').stroke();
  y += 10;
  const totalLine = (label, value, bold = false) => {
    doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(bold ? 12 : 10);
    doc.text(label, 300, y, { width: 140, align: 'right' });
    doc.text(value, 450, y, { width: 95, align: 'right' });
    y += bold ? 22 : 18;
  };
  totalLine('Subtotal', money(invoice.subtotal, currency));
  if (invoice.discount > 0) {
    totalLine('Discount', `- ${money(invoice.discount, currency)}`);
    totalLine('Taxable amount', money(invoice.subtotal - invoice.discount, currency));
  }
  if (invoice.tax > 0) totalLine('Tax', money(invoice.tax, currency));
  totalLine('Total', money(invoice.total, currency), true);
  if (paid > 0) {
    totalLine('Paid', money(paid, currency));
    totalLine('Balance', money(invoice.balance, currency), true);
  }

  // ---- Notes / footer ----
  if (invoice.notes) {
    doc.font('Helvetica').fontSize(9);
    const notesHeight = Math.ceil(doc.heightOfString(invoice.notes, { width: 480 }));
    if (y + 28 + notesHeight > contentBottom(doc)) y = addContentPage(doc);
    y += 14;
    doc.font('Helvetica-Bold').fontSize(10).text('Notes', PAGE_MARGIN, y);
    doc
      .font('Helvetica')
      .fontSize(9)
      .fillColor('#444')
      .text(invoice.notes, PAGE_MARGIN, y + 14, { width: 480 });
    doc.fillColor('#000');
  }
}

/**
 * Render a purchase invoice to a PDF and stream it into `res`. Resolves once the PDF
 * has finished streaming and rejects if generation fails before any bytes were
 * sent (so the caller can still return a clean error). Once streaming has
 * started the headers are already committed, so a later failure just tears the
 * response down rather than corrupting it.
 *
 * @param {object} invoice  GoodsPurchase doc with `vendor` and `warehouse` populated.
 * @param {Writable} res    The HTTP response (or any writable stream).
 * @param {object} company  Backend company settings used by the template.
 */
function streamInvoicePdf(invoice, res, company) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      bufferPages: true,
      margins: {
        top: PAGE_MARGIN,
        right: PAGE_MARGIN,
        // Content uses the larger manual bottom reserve above; PDFKit keeps a
        // normal margin so buffered footer text can be placed inside the page.
        bottom: PAGE_MARGIN,
        left: PAGE_MARGIN,
      },
    });
    let started = false; // have any PDF bytes been written to the response yet?

    doc.on('data', () => {
      started = true;
    });
    doc.on('end', resolve);

    // A PDFKit stream error after headers are sent can't be turned into a clean
    // HTTP error; just stop the stream and tear the response down.
    doc.on('error', (err) => {
      if (!res.headersSent) reject(err);
      else res.destroy(err);
    });

    // If the client disconnects mid-download, stop generating so a huge invoice
    // doesn't keep tying up the event loop writing to a dead socket.
    res.on('close', () => doc.destroy());

    doc.pipe(res);

    try {
      renderInvoice(doc, invoice, company);
      drawFooters(doc);
      doc.end();
    } catch (err) {
      doc.destroy();
      // Synchronous render error before any bytes left: surface it cleanly.
      if (!started && !res.headersSent) reject(err);
      else res.destroy(err);
    }
  });
}

module.exports = { streamInvoicePdf };
