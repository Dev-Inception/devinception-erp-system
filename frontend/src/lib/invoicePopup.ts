import { renderTemplate } from './printing';
import { api } from './api';
import { usePrintPreviewStore } from '@/store/printPreview';

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

// The invoice note set once in Settings (falls back from the store's own row
// to the super-admin's global one — see FALLBACK_FIELDS in settingsService).
// Omitted, never blocks printing, if unset or the lookup fails.
//
// `storeId` must be forwarded here for the same reason `companyInfo` takes
// it: a multi-store admin has no "current store" on the backend without it,
// so an omitted store param resolves to the *global* settings row instead of
// the store's own — silently returning the wrong (usually empty) note.
async function invoiceFooterNote(storeId?: string): Promise<string | undefined> {
  try {
    const note = (await api.get('/settings', storeId ? { params: { store: storeId } } : undefined))
      .data?.invoiceNote;
    return note && String(note).trim() ? String(note).trim() : undefined;
  } catch {
    return undefined;
  }
}

async function buildInvoiceHtml(sale: SaleForInvoice) {
  const [bankNote, footerNote, settings] = await Promise.all([
    bankNoteFor(sale.storeId),
    invoiceFooterNote(sale.storeId),
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

export async function openSaleInvoicePopup(sale: SaleForInvoice) {
  const html = await buildInvoiceHtml(sale);
  usePrintPreviewStore.getState().open(html);
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
  const [footerNote, settings] = await Promise.all([
    invoiceFooterNote(receipt.storeId),
    companyInfo(receipt.storeId),
  ]);
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
    footerNote,
  });
}

export async function openStockReceiptInvoicePopup(receipt: StockReceiptForInvoice) {
  const html = await buildReceiptInvoiceHtml(receipt);
  usePrintPreviewStore.getState().open(html);
}

/** A vendor-facing printout of a *regular* sale's vendor-sourced lines —
 * same INVOICE_A4 template, with the vendor as the "party" instead of the
 * customer and only the items whose stock originated from that vendor.
 * Prices are the vendor's purchase price/line total from Pending Entities
 * (not the customer's sale price), same blank-until-priced convention as
 * `StockReceiptForInvoice`. Distinct from `VendorSaleForInvoice` below,
 * which prints an actual VendorSale document (a vendor buying stock from
 * us) rather than vendor-sourced lines embedded in someone else's sale. */
export interface VendorSourcedItemsForInvoice {
  saleNumber: string;
  date: string;
  storeId?: string;
  storeName?: string;
  storeAddress?: string;
  vendorName: string;
  vendorPhone?: string;
  items: {
    name: string;
    quantity: number | string;
    purchasePrice?: number | string;
    lineTotal?: number | string;
    pricingStatus?: 'PENDING' | 'PRICED';
  }[];
  pricedTotal: number | string;
}

async function buildVendorSourcedItemsInvoiceHtml(sale: VendorSourcedItemsForInvoice) {
  const [bankNote, footerNote, settings] = await Promise.all([
    bankNoteFor(sale.storeId),
    invoiceFooterNote(sale.storeId),
    companyInfo(sale.storeId),
  ]);
  const company = {
    name: sale.storeName || settings.name,
    address: sale.storeAddress || settings.address,
    phone: settings.phone,
    email: settings.email,
    taxNumber: settings.taxNumber,
    logoUrl: settings.logoUrl,
  };
  const hasUnpriced = sale.items.some((i) => i.pricingStatus !== 'PRICED');
  return renderTemplate('INVOICE_A4', {
    company,
    docTitle: 'Vendor Invoice',
    docNumberLabel: 'Sale #',
    number: sale.saleNumber,
    date: new Date(sale.date).toLocaleString(),
    partyName: sale.vendorName,
    partyPhone: sale.vendorPhone || undefined,
    invoiceType: 'Items Sourced from Vendor',
    items: sale.items.map((i) => ({
      name: i.name,
      qty: Number(i.quantity),
      price: i.purchasePrice !== undefined ? Number(i.purchasePrice) : 0,
      amount: i.lineTotal !== undefined ? Number(i.lineTotal) : 0,
    })),
    subtotal: Number(sale.pricedTotal),
    tax: 0,
    total: Number(sale.pricedTotal),
    notes: hasUnpriced
      ? 'Some items are awaiting a purchase price from Pending Entities and show as 0 until priced.'
      : undefined,
    bankNote,
    footerNote,
  });
}

export async function openVendorSourcedItemsInvoicePopup(sale: VendorSourcedItemsForInvoice) {
  const html = await buildVendorSourcedItemsInvoiceHtml(sale);
  usePrintPreviewStore.getState().open(html);
}

/** The actual VendorSale document's own invoice — a vendor buying stock
 * from us, the mirror of a regular customer SaleForInvoice but with the
 * vendor as the "Bill To" party. See VendorSourcedItemsForInvoice above for
 * the unrelated "vendor-sourced lines inside someone else's sale" printout. */
export interface VendorSaleForInvoice {
  number: string;
  date: string;
  storeId?: string;
  storeName?: string;
  vendorName: string;
  vendorPhone?: string;
  items: {
    name: string;
    quantity: number | string;
    unitPrice: number | string;
    amount: number | string;
  }[];
  subtotal: number | string;
  discount: number | string;
  tax: number | string;
  total: number | string;
  paymentMethod?: string;
  returnedTotal?: number | string;
  note?: string;
}

async function buildVendorSaleDocInvoiceHtml(sale: VendorSaleForInvoice) {
  const [bankNote, footerNote, settings] = await Promise.all([
    bankNoteFor(sale.storeId),
    invoiceFooterNote(sale.storeId),
    companyInfo(sale.storeId),
  ]);
  const company = {
    name: sale.storeName || settings.name,
    address: settings.address,
    phone: settings.phone,
    email: settings.email,
    taxNumber: settings.taxNumber,
    logoUrl: settings.logoUrl,
  };
  return renderTemplate('INVOICE_A4', {
    company,
    number: sale.number,
    date: new Date(sale.date).toLocaleString(),
    partyName: sale.vendorName,
    partyPhone: sale.vendorPhone || undefined,
    invoiceType: sale.paymentMethod ? PAYMENT_METHOD_LABEL[sale.paymentMethod] : undefined,
    items: sale.items.map((i) => ({
      name: i.name,
      qty: Number(i.quantity),
      price: Number(i.unitPrice),
      amount: Number(i.amount),
    })),
    subtotal: Number(sale.subtotal),
    tax: Number(sale.tax),
    discount: Number(sale.discount),
    total: Number(sale.total),
    returnedTotal: sale.returnedTotal ? Number(sale.returnedTotal) : undefined,
    notes: sale.note || undefined,
    bankNote,
    footerNote,
  });
}

export async function openVendorSaleInvoicePopup(sale: VendorSaleForInvoice) {
  const html = await buildVendorSaleDocInvoiceHtml(sale);
  usePrintPreviewStore.getState().open(html);
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
  const [footerNote, settings] = await Promise.all([
    invoiceFooterNote(damagedReturn.storeId),
    companyInfo(damagedReturn.storeId),
  ]);
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
    footerNote,
  });
}

export async function openDamagedStockReturnInvoicePopup(
  damagedReturn: DamagedStockReturnForInvoice,
) {
  const html = await buildDamagedStockReturnInvoiceHtml(damagedReturn);
  usePrintPreviewStore.getState().open(html);
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
    invoiceFooterNote(estimate.storeId),
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

export async function openEstimateInvoicePopup(estimate: EstimateForInvoice) {
  const html = await buildEstimateInvoiceHtml(estimate);
  usePrintPreviewStore.getState().open(html);
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
  const [footerNote, settings] = await Promise.all([invoiceFooterNote(), companyInfo()]);
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
    footerNote,
  });
}

export async function openLabourInvoicePopup(labour: LabourForInvoice) {
  const html = await buildLabourInvoiceHtml(labour);
  usePrintPreviewStore.getState().open(html);
}
