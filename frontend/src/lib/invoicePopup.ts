import { api } from './api';
import { renderTemplate } from './printing';

/**
 * Opens a printable INVOICE_A4 popup for a sale, with the sale's gate pass QR
 * (if any) embedded in it. Shared by the POS "Charge" flow and the Sales list
 * "View invoice" action so both produce the same document.
 */

interface SaleItemForInvoice {
  name: string;
  quantity: number | string;
  unitPrice: number | string;
  amount: number | string;
}

export interface SaleForInvoice {
  saleNumber: string;
  date: string;
  customer?: { name: string };
  items: SaleItemForInvoice[];
  subtotal: number | string;
  taxTotal: number | string;
  discountTotal: number | string;
  grandTotal: number | string;
  gatePassQrUrl?: string;
}

const COMPANY = { name: 'DevInception Retail', address: 'HQ, Lahore', phone: '+92 300 1234567' };

function blobToDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

function buildInvoiceHtml(sale: SaleForInvoice, qrDataUrl?: string) {
  return renderTemplate('INVOICE_A4', {
    company: COMPANY,
    number: sale.saleNumber,
    date: new Date(sale.date).toLocaleString(),
    partyName: sale.customer?.name ?? 'Walk-in Customer',
    items: sale.items.map((i) => ({
      name: i.name,
      qty: Number(i.quantity),
      price: Number(i.unitPrice),
      amount: Number(i.amount),
    })),
    subtotal: Number(sale.subtotal),
    tax: Number(sale.taxTotal),
    discount: Number(sale.discountTotal),
    total: Number(sale.grandTotal),
    qrDataUrl,
  });
}

// Writes into `target` if it's still open (a window pre-opened synchronously
// on the triggering click, so it isn't blocked once we fill it in after an
// async QR fetch), otherwise opens a fresh one.
function writeInvoicePopup(
  sale: SaleForInvoice,
  qrDataUrl: string | undefined,
  target?: Window | null,
) {
  const win =
    target && !target.closed ? target : window.open('', '_blank', 'width=850,height=1000');
  if (!win) return false;
  win.document.open();
  win.document.write(buildInvoiceHtml(sale, qrDataUrl));
  win.document.close();
  win.focus();
  return true;
}

export async function openSaleInvoicePopup(sale: SaleForInvoice, target?: Window | null) {
  let qrDataUrl: string | undefined;
  if (sale.gatePassQrUrl) {
    try {
      const res = await api.get(sale.gatePassQrUrl, { responseType: 'blob' });
      qrDataUrl = await blobToDataUrl(res.data);
    } catch {
      // Print without the QR rather than blocking the invoice entirely.
    }
  }
  if (!writeInvoicePopup(sale, qrDataUrl, target)) {
    throw new Error('POPUP_BLOCKED');
  }
}
