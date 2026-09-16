import { renderTemplate } from './printing';
import { api } from './api';

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
  storeId?: string;
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

interface CompanyInfo {
  name: string;
  address?: string;
  phone?: string;
  email?: string;
  taxNumber?: string;
  logoUrl?: string;
}

// The company identity (name, address, contact, tax number, logo) configured
// once on the Settings page — printed at the top of every invoice/receipt so
// a change there is reflected everywhere without touching each template.
// Falls back to the generic placeholder identity if the lookup fails, so a
// Settings hiccup never blocks printing.
//
// `storeId` must be passed whenever the document belongs to a specific store:
// an admin who manages more than one store has no "current store" on the
// backend without it, and GET /settings 400s ("Select a store first") —
// silently caught below, which otherwise looks like Settings was just empty.
async function companyInfo(storeId?: string): Promise<CompanyInfo> {
  try {
    const s = (await api.get('/settings', storeId ? { params: { store: storeId } } : undefined))
      .data;
    return {
      name: s?.companyName || COMPANY.name,
      address: s?.address || COMPANY.address,
      phone: s?.phone || COMPANY.phone,
      email: s?.email || undefined,
      taxNumber: s?.taxNumber || undefined,
      logoUrl: s?.logoUrl || undefined,
    };
  } catch {
    return { name: COMPANY.name, address: COMPANY.address, phone: COMPANY.phone };
  }
}

// The issuing store's active bank account(s), formatted as a one-line note
// so a customer can settle any remaining balance by transfer. Silently
// omitted (never blocks printing) if the store has none set up yet, or the
// lookup fails for any reason.
async function bankNoteFor(storeId: string | undefined): Promise<string | undefined> {
  if (!storeId) return undefined;
  try {
    const accounts: {
      name: string;
      bankName?: string;
      accountNumber?: string;
      isActive: boolean;
    }[] = (await api.get('/bank/accounts', { params: { store: storeId } })).data;
    const lines = accounts
      .filter((a) => a.isActive)
      .map((a) => [a.name, a.bankName, a.accountNumber].filter(Boolean).join(' — '));
    if (!lines.length) return undefined;
    // One row per account, under a heading row — rendered as-is by the
    // INVOICE_A4 template (see printing.ts), not a single inline line.
    const rows = lines.map((line) => `<div>${line}</div>`).join('');
    return `<div style="font-weight:700;margin-bottom:4px;">Bank Details</div>${rows}`;
  } catch {
    return undefined;
  }
}

// The company-wide invoice note (e.g. a return policy) set once in Settings.
// Omitted, never blocks printing, if unset or the lookup fails.
async function invoiceFooterNote(): Promise<string | undefined> {
  try {
    const note = (await api.get('/settings')).data?.invoiceNote;
    return note && String(note).trim() ? String(note).trim() : undefined;
  } catch {
    return undefined;
  }
}

async function buildInvoiceHtml(sale: SaleForInvoice) {
  const [bankNote, footerNote, settings] = await Promise.all([
    bankNoteFor(sale.storeId),
    invoiceFooterNote(),
    companyInfo(sale.storeId),
  ]);
  // The invoice header identifies the physical storefront the sale happened
  // at, not a single generic company block — falls back to the configured
  // company identity (name/address) only for legacy sales that predate the
  // store field. Contact details, tax number and logo always come from
  // Settings, since those aren't captured per-store-snapshot.
  const company = {
    name: sale.storeName || settings.name,
    address: sale.storeAddress || settings.address,
    phone: settings.phone,
    email: settings.email,
    taxNumber: settings.taxNumber,
    logoUrl: settings.logoUrl,
  };
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
    bankNote,
    footerNote,
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
  // Open (or claim) the window synchronously, before the bank-details fetch
  // below, so it stays a direct result of the click — an async gap here
  // would make browsers treat the later window.open as a blocked popup.
  const win =
    target && !target.closed ? target : window.open('', '_blank', 'width=850,height=1000');
  if (!win) throw new Error('POPUP_BLOCKED');
  const html = await buildInvoiceHtml(sale);
  if (!writeHtmlPopup(html, win)) {
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
  storeId?: string;
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

async function buildReceiptInvoiceHtml(receipt: StockReceiptForInvoice) {
  const settings = await companyInfo(receipt.storeId);
  const company = {
    name: receipt.storeName || settings.name,
    address: settings.address,
    phone: settings.phone,
    email: settings.email,
    taxNumber: settings.taxNumber,
    logoUrl: settings.logoUrl,
  };
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
  const win =
    target && !target.closed ? target : window.open('', '_blank', 'width=850,height=1000');
  if (!win) throw new Error('POPUP_BLOCKED');
  const html = await buildReceiptInvoiceHtml(receipt);
  if (!writeHtmlPopup(html, win)) {
    throw new Error('POPUP_BLOCKED');
  }
}

/** A debit note for damaged goods handed back to a supplier — same
 * INVOICE_A4 template, headed "Debit Note" since it documents value going
 * back out rather than a purchase coming in. */
export interface DamagedStockReturnForInvoice {
  returnNumber: string;
  date: string;
  storeId?: string;
  storeName?: string;
  supplierName: string;
  items: {
    name: string;
    quantity: number | string;
    unitCost?: number | string;
    lineTotal?: number | string;
  }[];
  total: number | string;
  truck?: { driverName?: string; driverPhone?: string; vehicleNumber?: string };
  note?: string;
}

async function buildDamagedStockReturnInvoiceHtml(damagedReturn: DamagedStockReturnForInvoice) {
  const settings = await companyInfo(damagedReturn.storeId);
  const company = {
    name: damagedReturn.storeName || settings.name,
    address: settings.address,
    phone: settings.phone,
    email: settings.email,
    taxNumber: settings.taxNumber,
    logoUrl: settings.logoUrl,
  };
  return renderTemplate('INVOICE_A4', {
    company,
    docTitle: 'Debit Note',
    docNumberLabel: 'Return #',
    number: damagedReturn.returnNumber,
    date: new Date(damagedReturn.date).toLocaleString(),
    partyName: damagedReturn.supplierName,
    invoiceType: 'Damaged Goods Returned',
    items: damagedReturn.items.map((i) => ({
      name: i.name,
      qty: Number(i.quantity),
      price: i.unitCost !== undefined ? Number(i.unitCost) : 0,
      amount: i.lineTotal !== undefined ? Number(i.lineTotal) : 0,
    })),
    subtotal: Number(damagedReturn.total),
    tax: 0,
    total: Number(damagedReturn.total),
    transport:
      damagedReturn.truck?.driverName || damagedReturn.truck?.vehicleNumber
        ? damagedReturn.truck
        : undefined,
    notes: damagedReturn.note || undefined,
  });
}

export async function openDamagedStockReturnInvoicePopup(
  damagedReturn: DamagedStockReturnForInvoice,
  target?: Window | null,
) {
  const win =
    target && !target.closed ? target : window.open('', '_blank', 'width=850,height=1000');
  if (!win) throw new Error('POPUP_BLOCKED');
  const html = await buildDamagedStockReturnInvoiceHtml(damagedReturn);
  if (!writeHtmlPopup(html, win)) {
    throw new Error('POPUP_BLOCKED');
  }
}

/** A customer-facing printout of a quote — same INVOICE_A4 template as
 * sales, headed "Estimate" instead of "Invoice" and with none of the
 * payment/transport/labour/returns sections a real sale can have (the
 * estimate schema carries no such data, so the template simply omits
 * those sections rather than needing a forked layout). */
export interface EstimateForInvoice {
  estimateNumber: string;
  date: string;
  storeId?: string;
  storeName?: string;
  storeAddress?: string;
  customer?: { name: string; phone?: string };
  items: SaleItemForInvoice[];
  subtotal: number | string;
  taxTotal: number | string;
  discountTotal: number | string;
  grandTotal: number | string;
  notes?: string;
}

async function buildEstimateInvoiceHtml(estimate: EstimateForInvoice) {
  const [bankNote, footerNote, settings] = await Promise.all([
    bankNoteFor(estimate.storeId),
    invoiceFooterNote(),
    companyInfo(estimate.storeId),
  ]);
  const company = {
    name: estimate.storeName || settings.name,
    address: estimate.storeAddress || settings.address,
    phone: settings.phone,
    email: settings.email,
    taxNumber: settings.taxNumber,
    logoUrl: settings.logoUrl,
  };
  return renderTemplate('INVOICE_A4', {
    company,
    docTitle: 'Estimate',
    docNumberLabel: 'Estimate #',
    number: estimate.estimateNumber,
    date: new Date(estimate.date).toLocaleString(),
    partyName: estimate.customer?.name ?? 'Walk-in Customer',
    partyPhone: estimate.customer?.phone || undefined,
    items: estimate.items.map((i) => ({
      name: i.name,
      qty: Number(i.quantity),
      price: Number(i.unitPrice),
      amount: Number(i.amount),
    })),
    subtotal: Number(estimate.subtotal),
    tax: Number(estimate.taxTotal),
    discount: Number(estimate.discountTotal),
    total: Number(estimate.grandTotal),
    notes: estimate.notes || undefined,
    bankNote,
    footerNote,
  });
}

export async function openEstimateInvoicePopup(
  estimate: EstimateForInvoice,
  target?: Window | null,
) {
  const win =
    target && !target.closed ? target : window.open('', '_blank', 'width=850,height=1000');
  if (!win) throw new Error('POPUP_BLOCKED');
  const html = await buildEstimateInvoiceHtml(estimate);
  if (!writeHtmlPopup(html, win)) {
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

async function buildLabourInvoiceHtml(labour: LabourForInvoice) {
  const settings = await companyInfo();
  const total = labour.jobs.reduce((sum, j) => sum + Number(j.rent), 0);
  return renderTemplate('INVOICE_A4', {
    company: settings,
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
  const win =
    target && !target.closed ? target : window.open('', '_blank', 'width=850,height=1000');
  if (!win) throw new Error('POPUP_BLOCKED');
  const html = await buildLabourInvoiceHtml(labour);
  if (!writeHtmlPopup(html, win)) {
    throw new Error('POPUP_BLOCKED');
  }
}
