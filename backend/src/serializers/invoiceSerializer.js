const { view } = require('../utils/money');

const STATUS_VIEW = { PAID: 'PAID', PARTIAL: 'PARTIALLY_PAID', UNPAID: 'ISSUED' };

function serializeInvoice(invoice) {
  const raw = invoice && invoice.toJSON ? invoice.toJSON() : invoice;
  const i = view(raw, ['subtotal', 'discount', 'tax', 'total', 'cost', 'amountPaid', 'balance']);
  if (Array.isArray(i.items)) {
    i.items = i.items.map((item) => view(item, ['unitPrice', 'lineTotal', 'cost']));
  }

  const customer = i.customer;
  const populated = customer && typeof customer === 'object' && customer.name !== undefined;
  if (populated) {
    i.customerId = String(customer._id ?? customer.id);
    i.customer = { ...customer, name: customer.name || i.customerName };
  } else {
    i.customerId = customer ? String(customer._id ?? customer) : undefined;
    i.customer = { name: i.customerName };
  }

  i.invoiceNumber = i.number;
  i.issueDate = i.date;
  i.paidAmount = i.amountPaid;
  i.taxableAmount = Math.round((i.subtotal - i.discount) * 100) / 100;
  i.netSubtotal = i.taxableAmount;
  i.grandTotal = i.total;
  i.taxTotal = i.tax;
  i.discountTotal = i.discount;
  i.saleId = i.sale ? String(i.sale._id ?? i.sale) : undefined;
  i.pdfUrl = `/invoices/${i._id}/pdf`;
  i.download = {
    format: 'pdf',
    url: i.pdfUrl,
    apiPath: `/api${i.pdfUrl}`,
    filename: `${i.number}.pdf`,
    contentType: 'application/pdf',
    requiresAuthentication: true,
  };
  i.status = STATUS_VIEW[i.status] || i.status;
  return i;
}

module.exports = { serializeInvoice };
