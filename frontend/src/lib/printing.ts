import { formatCurrency } from './utils';

/**
 * Printing service — generates HTML for each template type and prints it via
 * window.print() in a hidden iframe.
 */

export type TemplateType = 'INVOICE_A4' | 'RECEIPT_THERMAL' | 'OT_THERMAL';

interface LineItem {
  name: string;
  qty: number;
  price: number;
  amount: number;
}
interface DocData {
  company: {
    name: string;
    address?: string;
    phone?: string;
    email?: string;
    taxNumber?: string;
    logoUrl?: string;
  };
  // Lets non-sale documents (e.g. an Estimate) relabel the A4 template's
  // header without forking it — defaults to "Invoice"/"Invoice #" below.
  docTitle?: string;
  docNumberLabel?: string;
  number: string;
  date: string;
  // Short badge shown right next to the doc number in the header — e.g.
  // "Sale", "Credit", "Return" for a customer sale invoice. Distinct from
  // invoiceType below (a free-text blurb some other document kinds show in
  // the Invoice Details box).
  documentType?: string;
  partyName?: string;
  partyPhone?: string;
  invoiceType?: string;
  items: LineItem[];
  subtotal: number;
  tax: number;
  discount?: number;
  transportFare?: number;
  labourRentTotal?: number;
  total: number;
  // Already deducted from `total` (see api.ts mapSale) — surfaced here too
  // so the deduction is visible, not just baked silently into the total.
  returnedTotal?: number;
  paidAmount?: number;
  balanceDue?: number;
  // Customer's running receivable, snapshotted at this sale's moment — null/
  // undefined for walk-in sales, which carry no account balance.
  previousBalance?: number | null;
  totalRemaining?: number | null;
  labour?: { name: string; phone?: string; rent?: number }[];
  transport?: { driverName?: string; driverPhone?: string; vehicleNumber?: string };
  // Returns recorded against this sale, if any — shown so a reprinted
  // invoice reflects what's actually still owed, not just the original sale.
  returns?: {
    number: string;
    date: string;
    items: { name: string; quantity: number; amount: number }[];
  }[];
  notes?: string;
  // A neutral (non-warning) note — currently used for the issuing store's
  // bank account details, so a customer can settle any balance by transfer.
  // Kept separate from `notes`, which is styled as a warning.
  bankNote?: string;
  // A fixed business note (e.g. a return policy) configured once in Settings
  // and printed as an extra line under Notes on every invoice — distinct
  // from `notes`, which is a one-off warning for this specific document.
  footerNote?: string;
}

const thermalStyles = `
  <style>
    * { font-family: 'Courier New', monospace; }
    body { width: 72mm; margin: 0; padding: 4mm; font-size: 12px; color: #000; }
    h1 { font-size: 14px; text-align: center; margin: 0 0 2mm; }
    .muted { text-align: center; font-size: 10px; }
    table { width: 100%; border-collapse: collapse; margin-top: 3mm; }
    td { padding: 1px 0; }
    .r { text-align: right; }
    .line { border-top: 1px dashed #000; margin: 2mm 0; }
    .total { font-weight: bold; font-size: 13px; }
  </style>`;

// Navy accent used throughout the invoice (header, section labels, table
// header bands, the TOTAL bar). Bands of solid color are painted with an
// inline SVG rect (see `fillRect`) rather than CSS `background`, because
// Chrome's print pipeline drops `background-color`/`background-image`
// whenever the browser/OS print dialog's "Background graphics" option is
// off (the common default) — no CSS override (including
// `print-color-adjust: exact`) restores it. An SVG shape's `fill` is real
// page content, not a "background", so it always prints — which is what
// keeps the printed invoice matching the on-screen preview exactly.
const NAVY = '#173A5C';

function fillRect(color: string) {
  return `<svg class="fill-bg" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="${color}"/></svg>`;
}

const a4Styles = `
  <style>
    @page { size: A5; margin: 6mm; }
    * { font-family: Inter, Arial, sans-serif; box-sizing: border-box; }
    html, body { width: 148mm; }
    body { margin: 0; padding: 4mm; color: #111; font-size: 9.5px; }
    .fill-bg { position: absolute; inset: 0; width: 100%; height: 100%; display: block; }
    .sheet { border: 1px solid #d1d5db; border-radius: 6px; padding: 8px 10px; }
    .section-label { font-size: 8.5px; font-weight: 700; color: ${NAVY}; text-transform: uppercase; letter-spacing: 0.4px; margin: 0 0 3px; }
    .head { display: flex; justify-content: space-between; align-items: flex-start; gap: 10px; padding-bottom: 6px; }
    .brand { display: flex; align-items: center; gap: 8px; }
    .logo { width: 30px; height: 30px; min-width: 30px; border-radius: 6px; border: 2px solid ${NAVY}; display: flex; align-items: center; justify-content: center; font-size: 13px; font-weight: 700; color: ${NAVY}; overflow: hidden; }
    .logo img { width: 100%; height: 100%; object-fit: contain; }
    h1 { margin: 0; font-size: 13px; color: #111; letter-spacing: 0.2px; }
    .brand .muted { margin: 1px 0 0; font-size: 8px; color: #555; line-height: 1.3; }
    .doc-title { text-align: right; font-size: 20px; font-weight: 800; color: ${NAVY}; letter-spacing: 1px; line-height: 1; }
    .inv-meta { margin-top: 4px; }
    .inv-meta .row { display: flex; justify-content: flex-end; gap: 8px; font-size: 8px; padding: 1px 0; }
    .inv-meta .label { color: #6b7280; text-transform: uppercase; letter-spacing: 0.3px; }
    .inv-meta .value { font-weight: 700; color: #111; }
    .rule { border: 0; border-top: 2px solid ${NAVY}; margin: 4px 0 8px; }
    .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 8px; }
    .info-grid.single { grid-template-columns: 1fr; }
    .info-box { border: 1px solid #e5e7eb; border-radius: 6px; padding: 6px 8px; }
    .info-box .info-name { font-weight: 700; font-size: 9.5px; }
    .info-box .info-line { font-size: 8.5px; color: #333; margin-top: 1px; }
    .info-box .info-line .k { color: #6b7280; }
    table { width: 100%; border-collapse: collapse; margin-top: 4px; page-break-inside: auto; }
    thead { display: table-header-group; }
    tr { page-break-inside: avoid; page-break-after: auto; }
    th { position: relative; padding: 0; text-align: left; }
    th .th-label { position: relative; z-index: 1; display: block; padding: 4px 5px; color: #fff; font-size: 8px; text-transform: uppercase; letter-spacing: 0.3px; font-weight: 700; }
    th.r .th-label { text-align: right; }
    th.c .th-label { text-align: center; }
    td { padding: 3px 5px; border-bottom: 1px solid #e5e7eb; font-size: 8.8px; }
    .r { text-align: right; }
    .c { text-align: center; }
    .bottom-grid { display: flex; gap: 12px; margin-top: 10px; align-items: flex-start; }
    .bottom-grid .notes-col { flex: 1; min-width: 0; }
    .bottom-grid .notes-col .info-line { font-size: 8.3px; color: #444; margin-bottom: 3px; }
    .totals-col { width: 44%; max-width: 190px; }
    .totals-col .row { display: flex; justify-content: space-between; padding: 1px 0; font-size: 8.8px; }
    .totals-col .row.muted { color: #6b7280; }
    .totals-col .divider { border-top: 1px solid #e5e7eb; margin: 3px 0; }
    .totals-col .grandbar { position: relative; display: flex; justify-content: space-between; align-items: center; margin-top: 4px; padding: 5px 8px; border-radius: 4px; overflow: hidden; }
    .totals-col .grandbar .label, .totals-col .grandbar .value { position: relative; z-index: 1; color: #fff; }
    .totals-col .grandbar .label { font-size: 8.5px; text-transform: uppercase; letter-spacing: 0.4px; font-weight: 700; }
    .totals-col .grandbar .value { font-size: 11px; font-weight: 800; }
    .totals-col .account { margin-top: 4px; padding-top: 4px; border-top: 1px solid #e5e7eb; }
    .totals-col .remaining { font-size: 10px; font-weight: 700; color: ${NAVY}; }
    .warning { margin-top: 8px; font-size: 8.5px; color: #b91c1c; page-break-inside: avoid; }
    .footer-note { margin-top: 5px; font-size: 10.5px; font-weight: 700; color: #111; }
    .footer-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-top: 12px; padding-top: 8px; border-top: 1px solid #e5e7eb; page-break-inside: avoid; }
    .footer-grid .info-line { font-size: 8px; color: #333; line-height: 1.5; }
    .sig-line { margin-top: 18px; border-top: 1px solid #9ca3af; width: 90%; font-size: 8px; color: #6b7280; padding-top: 2px; }
    .thankyou { margin-top: 10px; padding-top: 6px; border-top: 1px solid #e5e7eb; text-align: center; font-size: 8px; color: #555; page-break-inside: avoid; }
    .thankyou strong { color: #111; }
    @media print { .sheet { border: none; padding: 0; } }
  </style>`;

// Table headers are painted via `fillRect` (see note above `NAVY`), not CSS
// `background`, so the navy band survives print regardless of the browser's
// "Background graphics" setting.
function th(label: string, align: '' | 'r' | 'c' = '') {
  const cls = align ? ` class="${align}"` : '';
  return `<th${cls}>${fillRect(NAVY)}<span class="th-label">${label}</span></th>`;
}

function rows(items: LineItem[]) {
  return items
    .map(
      (i, idx) =>
        `<tr><td class="c">${idx + 1}</td><td>${i.name}</td><td class="r">${i.qty}</td><td class="r">${formatCurrency(i.price)}</td><td class="r">${formatCurrency(i.amount)}</td></tr>`,
    )
    .join('');
}

function labourRows(labour: { name: string; phone?: string; rent?: number }[]) {
  return labour
    .map(
      (l, idx) =>
        `<tr><td class="c">${idx + 1}</td><td>${l.name}</td><td>${l.phone || '—'}</td><td class="r">${formatCurrency(l.rent ?? 0)}</td></tr>`,
    )
    .join('');
}

function returnRows(
  returns: {
    number: string;
    date: string;
    items: { name: string; quantity: number; amount: number }[];
  }[],
) {
  return returns
    .flatMap((r) =>
      r.items.map(
        (it) =>
          `<tr><td>${r.number}</td><td>${it.name}</td><td class="r">${it.quantity}</td><td class="r">${formatCurrency(it.amount)}</td></tr>`,
      ),
    )
    .join('');
}

const sectionHeading = (title: string) => `<div class="section-label">${title}</div>`;

const ONES = [
  '',
  'One',
  'Two',
  'Three',
  'Four',
  'Five',
  'Six',
  'Seven',
  'Eight',
  'Nine',
  'Ten',
  'Eleven',
  'Twelve',
  'Thirteen',
  'Fourteen',
  'Fifteen',
  'Sixteen',
  'Seventeen',
  'Eighteen',
  'Nineteen',
];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

function threeDigitsToWords(n: number): string {
  const parts: string[] = [];
  if (n >= 100) {
    parts.push(`${ONES[Math.floor(n / 100)]} Hundred`);
    n %= 100;
  }
  if (n >= 20) {
    parts.push(TENS[Math.floor(n / 10)] + (n % 10 ? `-${ONES[n % 10].toLowerCase()}` : ''));
  } else if (n > 0) {
    parts.push(ONES[n]);
  }
  return parts.join(' ');
}

// Whole-rupee amount spelled out for the invoice footer, e.g. 110400 ->
// "One Hundred Ten Thousand Four Hundred". Cents/paisa are not spoken.
function amountInWords(value: number): string {
  const n = Math.round(Math.abs(value));
  if (n === 0) return 'Zero';
  const scales: [number, string][] = [
    [1_000_000_000, 'Billion'],
    [1_000_000, 'Million'],
    [1_000, 'Thousand'],
  ];
  let remaining = n;
  const parts: string[] = [];
  for (const [scale, label] of scales) {
    if (remaining >= scale) {
      parts.push(`${threeDigitsToWords(Math.floor(remaining / scale))} ${label}`);
      remaining %= scale;
    }
  }
  if (remaining > 0) parts.push(threeDigitsToWords(remaining));
  return parts.join(' ');
}

export function renderTemplate(type: TemplateType, d: DocData): string {
  const isThermal = type === 'RECEIPT_THERMAL' || type === 'OT_THERMAL';
  if (isThermal) {
    const isOT = type === 'OT_THERMAL';
    return `<!doctype html><html><head>${thermalStyles}</head><body>
      <h1>${d.company.name}</h1>
      <p class="muted">${d.company.address ?? ''}<br/>${d.company.phone ?? ''}</p>
      <div class="line"></div>
      <p>${isOT ? 'Order Ticket' : 'Receipt'}: ${d.number}<br/>Date: ${d.date}${d.partyName ? `<br/>Customer: ${d.partyName}` : ''}</p>
      <div class="line"></div>
      <table>${d.items.map((i) => `<tr><td>${i.name}</td><td class="r">${i.qty} x ${formatCurrency(i.price)}</td></tr>${isOT ? '' : `<tr><td></td><td class="r">${formatCurrency(i.amount)}</td></tr>`}`).join('')}</table>
      <div class="line"></div>
      ${
        isOT
          ? `<p>${d.notes ?? ''}</p>`
          : `<table>
        <tr><td>Subtotal</td><td class="r">${formatCurrency(d.subtotal)}</td></tr>
        <tr><td>Tax</td><td class="r">${formatCurrency(d.tax)}</td></tr>
        <tr class="total"><td>TOTAL</td><td class="r">${formatCurrency(d.total)}</td></tr>
      </table>`
      }
      <div class="line"></div>
      <p class="muted">Thank you!</p>
    </body></html>`;
  }

  // A4 invoice
  const totalItems = d.items.reduce((sum, i) => sum + (Number(i.qty) || 0), 0);
  const logoInitial = (d.company.name || '?').trim().charAt(0).toUpperCase();
  const logoHtml = d.company.logoUrl ? `<img src="${d.company.logoUrl}" alt="" />` : logoInitial;
  const companyContactLine = [d.company.phone, d.company.email].filter(Boolean).join(' | ');

  const hasInvoiceDetails =
    !!d.invoiceType || d.previousBalance != null || d.totalRemaining != null;

  return `<!doctype html><html><head>${a4Styles}</head><body>
    <div class="sheet">
      <div class="head">
        <div class="brand">
          <div class="logo">${logoHtml}</div>
          <div>
            <h1>${d.company.name}</h1>
            <p class="muted">${d.company.address ?? ''}${companyContactLine ? `<br/>${companyContactLine}` : ''}${d.company.taxNumber ? `<br/>NTN/STRN: ${d.company.taxNumber}` : ''}</p>
          </div>
        </div>
        <div>
          <div class="doc-title">${d.docTitle ?? 'Invoice'}</div>
          <div class="inv-meta">
            <div class="row"><span class="label">${d.docNumberLabel ?? 'Invoice #'}</span><span class="value">${d.number}</span></div>
            ${d.documentType ? `<div class="row"><span class="label">Invoice Type</span><span class="value">${d.documentType}</span></div>` : ''}
            <div class="row"><span class="label">Date</span><span class="value">${d.date}</span></div>
          </div>
        </div>
      </div>
      <hr class="rule" />
      <div class="info-grid${hasInvoiceDetails ? '' : ' single'}">
        <div class="info-box">
          <div class="section-label">Bill To</div>
          <div class="info-name">${d.partyName ?? 'Walk-in Customer'}</div>
          ${d.partyPhone ? `<div class="info-line">${d.partyPhone}</div>` : ''}
        </div>
        ${
          hasInvoiceDetails
            ? `<div class="info-box">
          <div class="section-label">Invoice Details</div>
          ${d.invoiceType ? `<div class="info-line"><span class="k">Payment Method:</span> ${d.invoiceType}</div>` : ''}
          ${d.previousBalance != null ? `<div class="info-line"><span class="k">Previous Balance:</span> ${formatCurrency(d.previousBalance)}</div>` : ''}
          ${d.totalRemaining != null ? `<div class="info-line"><span class="k">Total Remaining:</span> ${formatCurrency(d.totalRemaining)}</div>` : ''}
        </div>`
            : ''
        }
      </div>
      <div class="section-label">Products / Services</div>
      <table>
        <thead><tr>${th('#', 'c')}${th('Description')}${th('Qty', 'r')}${th('Unit Price', 'r')}${th('Amount', 'r')}</tr></thead>
        <tbody>${rows(d.items)}</tbody>
      </table>
      ${
        d.labour?.length
          ? `<div style="page-break-inside:avoid;">${sectionHeading('Labour')}
        <table>
          <thead><tr>${th('#', 'c')}${th('Name')}${th('Phone')}${th('Fare', 'r')}</tr></thead>
          <tbody>${labourRows(d.labour)}</tbody>
        </table></div>`
          : ''
      }
      ${
        d.transport?.driverName
          ? `<div style="page-break-inside:avoid;">${sectionHeading('Transport')}
        <table>
          <thead><tr>${th('Driver')}${th('Vehicle #')}${th('Phone')}${th('Fare', 'r')}</tr></thead>
          <tbody><tr><td>${d.transport.driverName}</td><td>${d.transport.vehicleNumber || '—'}</td><td>${d.transport.driverPhone || '—'}</td><td class="r">${formatCurrency(d.transportFare ?? 0)}</td></tr></tbody>
        </table></div>`
          : ''
      }
      ${
        d.returns?.length
          ? `<div style="page-break-inside:avoid;">${sectionHeading('Returns')}
        <table>
          <thead><tr>${th('Return #')}${th('Item')}${th('Qty', 'r')}${th('Amount', 'r')}</tr></thead>
          <tbody>${returnRows(d.returns)}</tbody>
        </table></div>`
          : ''
      }
      <div class="bottom-grid">
        <div class="notes-col">
          <div class="section-label">Notes</div>
          <div class="info-line">Amount: <strong>${amountInWords(d.total)} Only.</strong></div>
          ${d.notes ? `<div class="warning" style="margin-top:4px;">${d.notes}</div>` : ''}
          ${d.footerNote ? `<div class="footer-note">${d.footerNote}</div>` : ''}
        </div>
        <div class="totals-col">
          <div class="row muted"><span>Total Items</span><span>${totalItems}</span></div>
          <div class="row muted"><span>Subtotal</span><span>${formatCurrency(d.subtotal)}</span></div>
          ${d.discount ? `<div class="row muted"><span>Discount</span><span>-${formatCurrency(d.discount)}</span></div>` : ''}
          ${d.tax ? `<div class="row muted"><span>Tax</span><span>${formatCurrency(d.tax)}</span></div>` : ''}
          ${d.transportFare ? `<div class="row muted"><span>Transport Fare</span><span>${formatCurrency(d.transportFare)}</span></div>` : ''}
          ${d.labourRentTotal ? `<div class="row muted"><span>Labour Fare</span><span>${formatCurrency(d.labourRentTotal)}</span></div>` : ''}
          ${d.returnedTotal ? `<div class="row muted"><span>Returned</span><span>-${formatCurrency(d.returnedTotal)}</span></div>` : ''}
          <div class="divider"></div>
          <div class="grandbar">${fillRect(NAVY)}<span class="label">Total</span><span class="value">${formatCurrency(d.total)}</span></div>
          ${d.paidAmount ? `<div class="row muted" style="margin-top:4px;"><span>Paid</span><span>${formatCurrency(d.paidAmount)}</span></div>` : ''}
          ${
            d.balanceDue
              ? `<div class="account">
            <div class="row remaining"><span>Balance Due</span><span>${formatCurrency(d.balanceDue)}</span></div>
          </div>`
              : ''
          }
        </div>
      </div>
      <div class="footer-grid">
        <div>
          <div class="section-label">Payment Details</div>
          ${d.bankNote ? `<div class="info-line">${d.bankNote}</div>` : ''}
        </div>
        <div>
          <div class="section-label">Payment Terms</div>
          <div class="info-line">Payment is due upon receipt. Please quote the invoice number with any payment.</div>
        </div>
        <div>
          <div class="section-label">Authorized Signature</div>
          <div class="sig-line">Name / Title</div>
        </div>
      </div>
      <div class="thankyou"><strong>Thank you for your business!</strong></div>
    </div>
  </body></html>`;
}

/* ── Gate Pass (A4, full-page challan-style layout) ────────────────────── */

export interface GatePassDocData {
  company: {
    name: string;
    address?: string;
    phone?: string;
    email?: string;
    taxNumber?: string;
    logoUrl?: string;
  };
  number: string;
  date: string;
  direction: 'IN' | 'OUT';
  partyName: string;
  documentLabel: string; // e.g. "Sale #", "Purchase #", "Return #"
  documentNumber: string;
  purpose: string;
  items: {
    name: string;
    quantity: number;
  }[];
  preparedBy?: string;
  authorizedBy?: string;
  authorizedAt?: string;
  qrDataUrl?: string;
}

const gatePassStyles = `
  <style>
    @page { size: A4; margin: 12mm; }
    * { font-family: Inter, Arial, sans-serif; box-sizing: border-box; }
    html, body { width: 186mm; }
    body { margin: 0; padding: 0; color: #111; font-size: 10px; }
    .fill-bg { position: absolute; inset: 0; width: 100%; height: 100%; display: block; }
    .gp-sheet { border: 1px solid #d1d5db; border-radius: 6px; padding: 12px 14px; }
    .section-label { font-size: 9.5px; font-weight: 700; color: ${NAVY}; text-transform: uppercase; letter-spacing: 0.4px; margin: 14px 0 6px; }
    .section-label:first-of-type { margin-top: 0; }
    .gp-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; padding-bottom: 10px; }
    .gp-brand { display: flex; align-items: flex-start; gap: 10px; }
    .logo { width: 36px; height: 36px; min-width: 36px; border-radius: 8px; border: 2px solid ${NAVY}; display: flex; align-items: center; justify-content: center; font-size: 16px; font-weight: 700; color: ${NAVY}; overflow: hidden; }
    .logo img { width: 100%; height: 100%; object-fit: contain; }
    .gp-store-name { font-size: 15px; font-weight: 800; color: #111; }
    .gp-store-line { font-size: 8.5px; color: #555; margin-top: 2px; line-height: 1.4; }
    .gp-doc { text-align: right; }
    .gp-doc-title { font-size: 22px; font-weight: 800; color: ${NAVY}; letter-spacing: 1px; line-height: 1; }
    .gp-doc-sub { font-size: 8px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.3px; margin-top: 3px; }
    .gp-qr { width: 64px; height: 64px; margin: 6px 0 4px auto; display: block; }
    .gp-doc-meta { font-size: 9px; margin-top: 1px; }
    .gp-doc-meta .k { color: #6b7280; }
    .gp-doc-meta strong { color: #111; }
    .rule { border: 0; border-top: 2px solid ${NAVY}; margin: 0; }
    .gp-info-card { border: 1px solid #e5e7eb; border-radius: 6px; overflow: hidden; }
    .gp-info-grid { display: grid; grid-template-columns: repeat(3, 1fr); }
    .gp-info-row { padding: 6px 10px; border-bottom: 1px solid #e5e7eb; border-right: 1px solid #e5e7eb; }
    .gp-info-grid .gp-info-row:nth-child(3n) { border-right: none; }
    .gp-info-grid .gp-info-row:nth-last-child(-n+3) { border-bottom: none; }
    .gp-info-row .k { display: block; font-size: 7.8px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.3px; }
    .gp-info-row .v { display: block; margin-top: 2px; font-size: 9.5px; font-weight: 600; color: #111; }
    table { width: 100%; border-collapse: collapse; margin-top: 2px; }
    th { position: relative; padding: 0; text-align: left; }
    th .th-label { position: relative; z-index: 1; display: block; padding: 5px 6px; color: #fff; font-size: 8px; text-transform: uppercase; letter-spacing: 0.3px; font-weight: 700; }
    th.r .th-label { text-align: right; }
    th.c .th-label { text-align: center; }
    td { padding: 5px 6px; border-bottom: 1px solid #e5e7eb; font-size: 9px; }
    .r { text-align: right; }
    .c { text-align: center; }
    .gp-total-qty { text-align: right; margin-top: 6px; font-size: 9.5px; color: #333; }
    .gp-total-qty strong { color: #111; }
    .gp-auth-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px; margin-top: 8px; }
    .gp-auth-col { border: 1px solid #e5e7eb; border-radius: 6px; padding: 10px; min-height: 78px; }
    .gp-auth-col .section-label { margin: 0 0 8px; text-align: center; }
    .gp-auth-col .field { font-size: 9px; color: #333; margin-top: 14px; border-top: 1px solid #9ca3af; padding-top: 2px; }
    .gp-stamp-box { margin-top: 6px; height: 46px; border: 1px dashed #cbd5e1; border-radius: 4px; display: flex; align-items: center; justify-content: center; font-size: 8px; color: #9ca3af; text-transform: uppercase; letter-spacing: 0.4px; }
    .gp-footer { margin-top: 14px; text-align: center; font-size: 7.8px; color: #9ca3af; }
    @media print { .gp-sheet { border: none; padding: 0; } }
  </style>`;

function gatePassItemRows(items: GatePassDocData['items']) {
  return items
    .map(
      (it, idx) =>
        `<tr><td class="c">${idx + 1}</td><td>${it.name}</td><td class="r">${it.quantity}</td></tr>`,
    )
    .join('');
}

export function renderGatePassTemplate(d: GatePassDocData): string {
  const logoInitial = (d.company.name || '?').trim().charAt(0).toUpperCase();
  const logoHtml = d.company.logoUrl ? `<img src="${d.company.logoUrl}" alt="" />` : logoInitial;
  const totalQty = d.items.reduce((sum, i) => sum + (Number(i.quantity) || 0), 0);
  const contactLine = [d.company.phone, d.company.email].filter(Boolean).join(' | ');

  return `<!doctype html><html><head><title>${d.number}</title>${gatePassStyles}</head><body>
    <div class="gp-sheet">
      <div class="gp-head">
        <div class="gp-brand">
          <div class="logo">${logoHtml}</div>
          <div>
            <div class="gp-store-name">${d.company.name}</div>
            ${d.company.address ? `<div class="gp-store-line">${d.company.address}</div>` : ''}
            ${contactLine ? `<div class="gp-store-line">${contactLine}</div>` : ''}
            ${d.company.taxNumber ? `<div class="gp-store-line">NTN / STRN: ${d.company.taxNumber}</div>` : ''}
          </div>
        </div>
        <div class="gp-doc">
          <div class="gp-doc-title">GATE PASS</div>
          <div class="gp-doc-sub">${d.direction === 'OUT' ? 'Goods Outward / Material Exit' : 'Goods Inward / Material Receipt'}</div>
          ${d.qrDataUrl ? `<img class="gp-qr" src="${d.qrDataUrl}" />` : ''}
          <div class="gp-doc-meta"><span class="k">Gate Pass No:</span> <strong>${d.number}</strong></div>
          <div class="gp-doc-meta"><span class="k">Date:</span> ${d.date}</div>
        </div>
      </div>
      <hr class="rule" />
      <div class="section-label">Issued To / Customer Details</div>
      <div class="gp-info-card">
        <div class="gp-info-grid">
          <div class="gp-info-row"><span class="k">Customer / Company</span><span class="v">${d.partyName}</span></div>
          <div class="gp-info-row"><span class="k">${d.documentLabel}</span><span class="v">${d.documentNumber}</span></div>
          <div class="gp-info-row"><span class="k">Purpose</span><span class="v">${d.purpose}</span></div>
        </div>
      </div>
      <div class="section-label">Items / Material Details</div>
      <table>
        <thead><tr>${th('#', 'c')}${th('Product / Description')}${th('Qty', 'r')}</tr></thead>
        <tbody>${gatePassItemRows(d.items)}</tbody>
      </table>
      <div class="gp-total-qty">Total Quantity / Packages: <strong>${totalQty}</strong></div>
      <div class="gp-auth-grid">
        <div class="gp-auth-col">
          <div class="section-label">Prepared By</div>
          <div class="field">Name: ${d.preparedBy || ''}</div>
          <div class="field">Sign:</div>
        </div>
        <div class="gp-auth-col">
          <div class="section-label">Store Stamp</div>
          <div class="gp-stamp-box">Stamp Here</div>
        </div>
        <div class="gp-auth-col">
          <div class="section-label">Authorized By</div>
          <div class="field">Name: ${d.authorizedBy || ''}</div>
          <div class="field">Sign:${d.authorizedAt ? ` <span style="color:#9ca3af;">(${d.authorizedAt})</span>` : ''}</div>
        </div>
      </div>
      <div class="gp-footer">This gate pass is valid only when properly authorized and stamped.</div>
    </div>
  </body></html>`;
}

export async function printDocument(type: TemplateType, data: DocData) {
  const html = renderTemplate(type, data);

  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = '0';
  document.body.appendChild(iframe);
  iframe.contentDocument!.write(html);
  iframe.contentDocument!.close();
  iframe.contentWindow!.focus();
  iframe.contentWindow!.print();
  setTimeout(() => document.body.removeChild(iframe), 1000);
  return { ok: true };
}
