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
  labour?: { name: string }[];
  transport?: { driverName?: string; driverPhone?: string; vehicleNumber?: string };
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
  });
}

// Writes into `target` if it's still open (a window pre-opened synchronously
// on the triggering click, so it isn't blocked by the browser), otherwise
// opens a fresh one.
function writeInvoicePopup(sale: SaleForInvoice, target?: Window | null) {
  const win =
    target && !target.closed ? target : window.open('', '_blank', 'width=850,height=1000');
  if (!win) return false;
  win.document.open();
  win.document.write(buildInvoiceHtml(sale));
  win.document.close();
  win.focus();
  return true;
}

export async function openSaleInvoicePopup(sale: SaleForInvoice, target?: Window | null) {
  if (!writeInvoicePopup(sale, target)) {
    throw new Error('POPUP_BLOCKED');
  }
}
