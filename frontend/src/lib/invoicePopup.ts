import { renderTemplate } from './printing';

/**
 * Opens a printable INVOICE_A4 popup for a sale. Shared by the POS "Charge"
 * flow and the Sales list "View invoice" action so both produce the same
 * document. The gate pass (if any) is handled separately via the "View Gate
 * Pass" action, not embedded in this printout.
 */

interface SaleItemForInvoice {
  name: string;
  quantity: number | string;
  unitPrice: number | string;
  amount: number | string;
}

const PAYMENT_METHOD_LABEL: Record<string, string> = {
  CASH: 'Cash',
  CARD: 'Card',
  BANK_TRANSFER: 'Bank Transfer',
  ONLINE: 'Online',
  MIXED: 'Mixed',
  CREDIT: 'Credit',
};

export interface SaleForInvoice {
  saleNumber: string;
  date: string;
  storeName?: string;
  storeAddress?: string;
  customer?: { name: string; phone?: string };
  paymentMethod?: string;
  items: SaleItemForInvoice[];
  subtotal: number | string;
  taxTotal: number | string;
  discountTotal: number | string;
  transportFare?: number | string;
  labourRentTotal?: number | string;
  grandTotal: number | string;
  paidAmount?: number | string;
  balanceDue?: number | string;
  // Customer's account balance snapshotted at this sale — omitted/null for
  // walk-in sales, which don't carry a running balance.
  previousBalance?: number | string | null;
  totalRemaining?: number | string | null;
  labour?: { name: string; phone?: string; rent?: number }[];
  transport?: { driverName?: string; driverPhone?: string; vehicleNumber?: string };
  returnedTotal?: number | string;
  returns?: {
    number: string;
    date: string;
    items: { name: string; quantity: number; amount: number | string }[];
  }[];
}

const COMPANY = { name: 'DevInception Retail', address: 'HQ, Lahore', phone: '+92 300 1234567' };

function buildInvoiceHtml(sale: SaleForInvoice) {
  // The invoice header identifies the physical storefront the sale happened
  // at, not a single generic company block — falls back to the generic
  // identity only for legacy sales that predate the store field.
  const company = sale.storeName
    ? { name: sale.storeName, address: sale.storeAddress || COMPANY.address, phone: COMPANY.phone }
    : COMPANY;
  return renderTemplate('INVOICE_A4', {
    company,
    number: sale.saleNumber,
    date: new Date(sale.date).toLocaleString(),
    partyName: sale.customer?.name ?? 'Walk-in Customer',
    partyPhone: sale.customer?.phone || undefined,
    invoiceType: sale.paymentMethod ? PAYMENT_METHOD_LABEL[sale.paymentMethod] : undefined,
    items: sale.items.map((i) => ({
      name: i.name,
      qty: Number(i.quantity),
      price: Number(i.unitPrice),
      amount: Number(i.amount),
    })),
    subtotal: Number(sale.subtotal),
    tax: Number(sale.taxTotal),
    discount: Number(sale.discountTotal),
    transportFare: sale.transportFare ? Number(sale.transportFare) : undefined,
    labourRentTotal: sale.labourRentTotal ? Number(sale.labourRentTotal) : undefined,
    total: Number(sale.grandTotal),
    paidAmount: sale.paidAmount !== undefined ? Number(sale.paidAmount) : undefined,
    balanceDue: sale.balanceDue !== undefined ? Number(sale.balanceDue) : undefined,
    previousBalance:
      sale.previousBalance !== undefined && sale.previousBalance !== null
        ? Number(sale.previousBalance)
        : null,
    totalRemaining:
      sale.totalRemaining !== undefined && sale.totalRemaining !== null
        ? Number(sale.totalRemaining)
        : null,
    labour: sale.labour,
    transport: sale.transport,
    returnedTotal: sale.returnedTotal ? Number(sale.returnedTotal) : undefined,
    returns: sale.returns?.map((r) => ({
      number: r.number,
      date: new Date(r.date).toLocaleString(),
      items: r.items.map((it) => ({
        name: it.name,
        quantity: it.quantity,
        amount: Number(it.amount),
      })),
    })),
  });
}

// Writes `html` into `target` if it's still open (a window pre-opened
// synchronously on the triggering click, so it isn't blocked by the
// browser), otherwise opens a fresh one.
function writeHtmlPopup(html: string, target?: Window | null) {
  const win =
    target && !target.closed ? target : window.open('', '_blank', 'width=850,height=1000');
  if (!win) return false;
  win.document.open();
  win.document.write(html);
  win.document.close();
  win.focus();
  return true;
}

export async function openSaleInvoicePopup(sale: SaleForInvoice, target?: Window | null) {
  if (!writeHtmlPopup(buildInvoiceHtml(sale), target)) {
    throw new Error('POPUP_BLOCKED');
  }
}

/** A GRN-style supplier invoice for a stock receipt — same INVOICE_A4
 * template as sales, with the supplier as the "party" and received
 * quantities as the line items. Items not yet priced (see Pending Entities)
 * print with a blank price/amount rather than a misleading zero. */
export interface StockReceiptForInvoice {
  receiptNumber: string;
  date: string;
  storeName?: string;
  supplierName: string;
  items: {
    name: string;
    quantity: number | string;
    purchasePrice?: number | string;
    lineTotal?: number | string;
    pricingStatus?: 'PENDING' | 'PRICED';
  }[];
  pricedTotal: number | string;
  paidAmount?: number | string;
  balanceDue?: number | string;
  // Truck fare — shown as its own section only when the driver info is
  // present; whether the supplier or we covered it is noted in `notes`.
  truckFare?: number | string;
  truckFarePaidBy?: 'SUPPLIER' | 'US';
  truck?: { driverName?: string; driverPhone?: string; vehicleNumber?: string };
  labour?: { name: string; phone?: string; rent?: number }[];
  labourRentTotal?: number | string;
}

function buildReceiptInvoiceHtml(receipt: StockReceiptForInvoice) {
  const company = receipt.storeName
    ? { name: receipt.storeName, address: COMPANY.address, phone: COMPANY.phone }
    : COMPANY;
  const hasUnpriced = receipt.items.some((i) => i.pricingStatus !== 'PRICED');
  const truckFare = Number(receipt.truckFare ?? 0);
  const labourRentTotal = Number(receipt.labourRentTotal ?? 0);
  const notes = [
    hasUnpriced
      ? 'Some items are awaiting a purchase price from Pending Entities and show as 0 until priced.'
      : null,
    truckFare > 0
      ? receipt.truckFarePaidBy === 'US'
        ? 'Truck fare paid by us at receiving time.'
        : 'Truck fare already covered by the supplier.'
      : null,
  ]
    .filter(Boolean)
    .join(' ');
  return renderTemplate('INVOICE_A4', {
    company,
    number: receipt.receiptNumber,
    date: new Date(receipt.date).toLocaleString(),
    partyName: receipt.supplierName,
    invoiceType: 'Goods Received',
    items: receipt.items.map((i) => ({
      name: i.name,
      qty: Number(i.quantity),
      price: i.purchasePrice !== undefined ? Number(i.purchasePrice) : 0,
      amount: i.lineTotal !== undefined ? Number(i.lineTotal) : 0,
    })),
    subtotal: Number(receipt.pricedTotal),
    tax: 0,
    transportFare: truckFare || undefined,
    transport:
      receipt.truck?.driverName || receipt.truck?.vehicleNumber ? receipt.truck : undefined,
    labour: receipt.labour?.some((l) => l.rent) ? receipt.labour : undefined,
    labourRentTotal: labourRentTotal || undefined,
    total: Number(receipt.pricedTotal) + truckFare + labourRentTotal,
    paidAmount: receipt.paidAmount !== undefined ? Number(receipt.paidAmount) : undefined,
    balanceDue: receipt.balanceDue !== undefined ? Number(receipt.balanceDue) : undefined,
    notes: notes || undefined,
  });
}

export async function openStockReceiptInvoicePopup(
  receipt: StockReceiptForInvoice,
  target?: Window | null,
) {
  if (!writeHtmlPopup(buildReceiptInvoiceHtml(receipt), target)) {
    throw new Error('POPUP_BLOCKED');
  }
}

/** A running statement of what a labourer earned rent on — same INVOICE_A4
 * template as sales/receipts, with the labourer as the "party" and each job
 * (sale or stock receipt) they worked as a line item. */
export interface LabourForInvoice {
  labourName: string;
  jobs: {
    sourceLabel: string; // e.g. "Sale #SALE-2026-000059"
    date: string;
    rent: number | string;
  }[];
}

function buildLabourInvoiceHtml(labour: LabourForInvoice) {
  const total = labour.jobs.reduce((sum, j) => sum + Number(j.rent), 0);
  return renderTemplate('INVOICE_A4', {
    company: COMPANY,
    number: '',
    date: new Date().toLocaleString(),
    partyName: labour.labourName,
    invoiceType: 'Labour Statement',
    items: labour.jobs.map((j) => ({
      name: `${j.sourceLabel} (${new Date(j.date).toLocaleDateString()})`,
      qty: 1,
      price: Number(j.rent),
      amount: Number(j.rent),
    })),
    subtotal: total,
    tax: 0,
    total,
  });
}

export async function openLabourInvoicePopup(labour: LabourForInvoice, target?: Window | null) {
  if (!writeHtmlPopup(buildLabourInvoiceHtml(labour), target)) {
    throw new Error('POPUP_BLOCKED');
  }
}
