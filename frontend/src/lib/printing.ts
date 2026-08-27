import { formatCurrency } from './utils';

/**
 * Printing service — generates HTML for each template type and routes it to a
 * printer. In Electron it prints silently via the native bridge; in the browser
 * it falls back to window.print() in a hidden iframe.
 */

export type TemplateType = 'INVOICE_A4' | 'RECEIPT_THERMAL' | 'OT_THERMAL';

interface LineItem {
  name: string;
  qty: number;
  price: number;
  amount: number;
}
interface DocData {
  company: { name: string; address?: string; phone?: string };
  number: string;
  date: string;
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
  // and printed as the very last line of the invoice, styled boldly so it
  // isn't missed — distinct from `notes`, which is a one-off warning.
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

const a4Styles = `
  <style>
    * { font-family: Inter, Arial, sans-serif; box-sizing: border-box; }
    body { margin: 0; padding: 16mm; color: #111; font-size: 13px; }
    .sheet { border: 1px solid #d1d5db; border-radius: 10px; padding: 20px 24px; }
    .head { display: flex; justify-content: space-between; align-items: center; gap: 16px; border-bottom: 3px solid #4f46e5; padding-bottom: 14px; }
    .brand { display: flex; align-items: center; gap: 14px; }
    .logo { width: 52px; height: 52px; min-width: 52px; border-radius: 50%; border: 2px solid #4f46e5; display: flex; align-items: center; justify-content: center; font-size: 20px; font-weight: 700; color: #4f46e5; }
    h1 { margin: 0; font-size: 22px; letter-spacing: 0.3px; }
    .brand .muted { margin: 2px 0 0; font-size: 11.5px; color: #555; line-height: 1.5; }
    .badge { text-align: right; }
    .badge .no { display: inline-block; background: #f3f4f6; border-radius: 6px; padding: 6px 14px; font-weight: 700; font-size: 14px; }
    .meta { display: flex; justify-content: space-between; gap: 24px; margin-top: 14px; padding: 10px 0; border-bottom: 1px solid #eee; font-size: 12.5px; }
    .meta > div { line-height: 1.7; }
    .meta .label { color: #6b7280; display: inline-block; min-width: 62px; }
    table { width: 100%; border-collapse: collapse; margin-top: 18px; }
    th { background: #1f2937; color: #fff; text-align: left; padding: 8px 10px; font-size: 11px; text-transform: uppercase; letter-spacing: 0.4px; }
    td { padding: 7px 10px; border-bottom: 1px solid #eee; }
    tbody tr:nth-child(even) { background: #f9fafb; }
    .r { text-align: right; }
    .c { text-align: center; }
    .totals { margin-top: 18px; width: 300px; margin-left: auto; border: 1px solid #e5e7eb; border-radius: 8px; padding: 12px 14px; }
    .totals .row { display: flex; justify-content: space-between; padding: 3px 0; font-size: 12.5px; }
    .totals .row.muted { color: #6b7280; }
    .totals .divider { border-top: 1px solid #e5e7eb; margin: 6px 0; }
    .totals .grand { font-size: 15px; font-weight: bold; }
    .totals .account { border-top: 2px solid #111; margin-top: 6px; padding-top: 8px; }
    .totals .remaining { font-size: 16px; font-weight: bold; color: #4f46e5; }
    .words { margin-top: 16px; font-size: 12px; color: #374151; }
    .words strong { color: #111; }
    .toolbar { display: flex; gap: 8px; justify-content: flex-end; margin-bottom: 16px; }
    .toolbar button { font: inherit; padding: 8px 16px; border-radius: 6px; border: 1px solid #4f46e5; background: #4f46e5; color: #fff; cursor: pointer; }
    .toolbar button.outline { background: #fff; color: #4f46e5; }
    @media print { .toolbar { display: none !important; } .sheet { border: none; padding: 0; } }
  </style>`;

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

// Heading styled like the "sr" column labels above the items table, so the
// labour/transport blocks below read as an extension of the same grid.
const sectionHeading = (title: string) =>
  `<div style="font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.4px;margin:16px 0 4px;">${title}</div>`;

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

  return `<!doctype html><html><head>${a4Styles}</head><body>
    <div class="toolbar">
      <button type="button" class="outline" onclick="window.print()">Download PDF</button>
      <button type="button" onclick="window.print()">Print</button>
    </div>
    <div class="sheet">
      <div class="head">
        <div class="brand">
          <div class="logo">${logoInitial}</div>
          <div>
            <h1>${d.company.name}</h1>
            <p class="muted">${d.company.address ?? ''}${d.company.phone ? `<br/>${d.company.phone}` : ''}</p>
          </div>
        </div>
        <div class="badge"><span class="no">${d.number}</span></div>
      </div>
      <div class="meta">
        <div>
          <div><span class="label">Name:</span> ${d.partyName ?? 'Walk-in Customer'}</div>
          ${d.partyPhone ? `<div><span class="label">Contact:</span> ${d.partyPhone}</div>` : ''}
        </div>
        <div class="r">
          <div><span class="label">Date:</span> ${d.date}</div>
          ${d.invoiceType ? `<div><span class="label">Inv Type:</span> ${d.invoiceType}</div>` : ''}
        </div>
      </div>
      <table>
        <thead><tr><th class="c">Sr</th><th>Item Name</th><th class="r">Qty</th><th class="r">Rate</th><th class="r">Amount</th></tr></thead>
        <tbody>${rows(d.items)}</tbody>
      </table>
      ${
        d.labour?.length
          ? `${sectionHeading('Labour')}
        <table>
          <thead><tr><th class="c">Sr</th><th>Name</th><th>Phone</th><th class="r">Fare</th></tr></thead>
          <tbody>${labourRows(d.labour)}</tbody>
        </table>`
          : ''
      }
      ${
        d.transport?.driverName
          ? `${sectionHeading('Transport')}
        <table>
          <thead><tr><th>Driver</th><th>Vehicle #</th><th>Phone</th><th class="r">Fare</th></tr></thead>
          <tbody><tr><td>${d.transport.driverName}</td><td>${d.transport.vehicleNumber || '—'}</td><td>${d.transport.driverPhone || '—'}</td><td class="r">${formatCurrency(d.transportFare ?? 0)}</td></tr></tbody>
        </table>`
          : ''
      }
      ${
        d.returns?.length
          ? `${sectionHeading('Returns')}
        <table>
          <thead><tr><th>Return #</th><th>Item</th><th class="r">Qty</th><th class="r">Amount</th></tr></thead>
          <tbody>${returnRows(d.returns)}</tbody>
        </table>`
          : ''
      }
      <div class="totals">
        <div class="row muted"><span>Total Items</span><span>${totalItems}</span></div>
        <div class="row muted"><span>Subtotal</span><span>${formatCurrency(d.subtotal)}</span></div>
        ${d.discount ? `<div class="row muted"><span>Discount</span><span>-${formatCurrency(d.discount)}</span></div>` : ''}
        ${d.tax ? `<div class="row muted"><span>Tax</span><span>${formatCurrency(d.tax)}</span></div>` : ''}
        ${d.transportFare ? `<div class="row muted"><span>Transport Fare</span><span>${formatCurrency(d.transportFare)}</span></div>` : ''}
        ${d.labourRentTotal ? `<div class="row muted"><span>Labour Fare</span><span>${formatCurrency(d.labourRentTotal)}</span></div>` : ''}
        ${d.returnedTotal ? `<div class="row muted"><span>Returned</span><span>-${formatCurrency(d.returnedTotal)}</span></div>` : ''}
        <div class="divider"></div>
        <div class="row grand"><span>Total</span><span>${formatCurrency(d.total)}</span></div>
        ${d.paidAmount ? `<div class="row muted"><span>Paid</span><span>${formatCurrency(d.paidAmount)}</span></div>` : ''}
        ${
          d.balanceDue
            ? `<div class="account">
          <div class="row remaining"><span>Balance Due</span><span>${formatCurrency(d.balanceDue)}</span></div>
        </div>`
            : ''
        }
      </div>
      <p class="words">Amount: <strong>${amountInWords(d.total)} Only.</strong></p>
      ${
        d.bankNote
          ? `<div style="margin-top:10px;padding:8px 12px;border:1px solid #c7d2fe;background:#eef2ff;border-radius:6px;font-size:13px;font-weight:600;color:#1f2937;">${d.bankNote}</div>`
          : ''
      }
      ${d.notes ? `<p style="margin-top:12px;color:#b91c1c;font-size:12px;">${d.notes}</p>` : ''}
      ${
        d.footerNote
          ? `<p style="margin-top:14px;font-size:14px;font-weight:700;color:#111;">${d.footerNote}</p>`
          : ''
      }
    </div>
  </body></html>`;
}

export async function printDocument(type: TemplateType, data: DocData, deviceName?: string) {
  const html = renderTemplate(type, data);

  // Electron: silent native print
  if (window.electronAPI) {
    return window.electronAPI.print({ html, type, deviceName });
  }

  // Browser fallback: hidden iframe + window.print()
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
