const { view } = require('../utils/money');

// Serialize a GoodsPurchase through the purchase-invoice API contract.
function serializeInvoice(invoice) {
  const raw = invoice && invoice.toJSON ? invoice.toJSON() : invoice;
  const i = view(raw, ['subtotal', 'discount', 'tax', 'total', 'paid', 'balance']);
  i.items = (i.items || []).map((item) => {
    const line = view(item, ['unitCost', 'tax', 'lineTotal']);
    return { ...line, unitPrice: line.unitCost };
  });

  const vendor = i.vendor;
  const populated = vendor && typeof vendor === 'object' && vendor.name !== undefined;
  i.vendorId = vendor
    ? String(populated ? (vendor._id ?? vendor.id) : (vendor._id ?? vendor))
    : undefined;
  i.vendor = populated ? { ...vendor, name: vendor.name || i.vendorName } : { name: i.vendorName };
  // Compatibility alias for clients that previously rendered customer.name.
  i.customer = i.vendor;
  i.partyType = 'VENDOR';
  i.invoiceType = 'PURCHASE';
  i.purchaseId = String(i._id);
  i.purchaseNumber = i.number;
  i.invoiceNumber = i.vendorInvoiceNo || i.number;
  i.issueDate = i.date;
  i.paidAmount = i.paid;
  i.taxableAmount = Math.round((i.subtotal - i.discount) * 100) / 100;
  i.netSubtotal = i.taxableAmount;
  i.grandTotal = i.total;
  i.taxTotal = i.tax;
  i.discountTotal = i.discount;
  i.status = i.balance <= 0 ? 'PAID' : i.paid > 0 ? 'PARTIALLY_PAID' : 'ISSUED';
  i.pdfUrl = `/invoices/${i._id}/pdf`;
  i.download = {
    format: 'pdf',
    url: i.pdfUrl,
    apiPath: `/api${i.pdfUrl}`,
    filename: `${i.number}.pdf`,
    contentType: 'application/pdf',
    requiresAuthentication: true,
  };
  return i;
}

module.exports = { serializeInvoice };
