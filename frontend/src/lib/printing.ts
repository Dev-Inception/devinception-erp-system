import { formatCurrency } from './utils';

/**
 * Printing service — generates HTML for each template type and routes it to a
 * printer. In Electron it prints silently via the native bridge; in the browser
 * it falls back to window.print() in a hidden iframe.
 */

export type TemplateType =
  | 'GP_DIVIDER'
  | 'GP_A4_HALF'
  | 'GP_A4_FULL'
  | 'INVOICE_A4'
  | 'RECEIPT_THERMAL'
  | 'OT_THERMAL';

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
  items: LineItem[];
  subtotal: number;
  tax: number;
  discount?: number;
  total: number;
  notes?: string;
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
    * { font-family: Inter, Arial, sans-serif; }
    body { margin: 0; padding: 16mm; color: #111; font-size: 13px; }
    .head { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #4f46e5; padding-bottom: 12px; }
    h1 { color: #4f46e5; margin: 0; font-size: 24px; }
    table { width: 100%; border-collapse: collapse; margin-top: 24px; }
    th { background: #f3f4f6; text-align: left; padding: 8px; font-size: 12px; text-transform: uppercase; }
    td { padding: 8px; border-bottom: 1px solid #eee; }
    .r { text-align: right; }
    .totals { margin-top: 16px; width: 280px; margin-left: auto; }
    .totals .grand { font-size: 16px; font-weight: bold; border-top: 2px solid #111; padding-top: 6px; }
  </style>`;

function rows(items: LineItem[]) {
  return items
    .map(
      (i) =>
        `<tr><td>${i.name}</td><td class="r">${i.qty}</td><td class="r">${formatCurrency(i.price)}</td><td class="r">${formatCurrency(i.amount)}</td></tr>`,
    )
    .join('');
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
      ${isOT ? `<p>${d.notes ?? ''}</p>` : `<table>
        <tr><td>Subtotal</td><td class="r">${formatCurrency(d.subtotal)}</td></tr>
        <tr><td>Tax</td><td class="r">${formatCurrency(d.tax)}</td></tr>
        <tr class="total"><td>TOTAL</td><td class="r">${formatCurrency(d.total)}</td></tr>
      </table>`}
      <div class="line"></div>
      <p class="muted">Thank you!</p>
    </body></html>`;
  }

  // A4 family (Invoice / GP full / GP half all share this skeleton)
  const heading = type === 'INVOICE_A4' ? 'INVOICE' : 'GOODS PURCHASE';
  return `<!doctype html><html><head>${a4Styles}</head><body>
    <div class="head">
      <div><h1>${heading}</h1><p>${d.company.name}<br/>${d.company.address ?? ''}<br/>${d.company.phone ?? ''}</p></div>
      <div class="r"><strong>${d.number}</strong><br/>${d.date}${d.partyName ? `<br/>${d.partyName}` : ''}</div>
    </div>
    <table>
      <thead><tr><th>Item</th><th class="r">Qty</th><th class="r">Rate</th><th class="r">Amount</th></tr></thead>
      <tbody>${rows(d.items)}</tbody>
    </table>
    <table class="totals">
      <tr><td>Subtotal</td><td class="r">${formatCurrency(d.subtotal)}</td></tr>
      ${d.discount ? `<tr><td>Discount</td><td class="r">-${formatCurrency(d.discount)}</td></tr>` : ''}
      <tr><td>Tax</td><td class="r">${formatCurrency(d.tax)}</td></tr>
      <tr class="grand"><td>Total</td><td class="r">${formatCurrency(d.total)}</td></tr>
    </table>
    ${d.notes ? `<p style="margin-top:24px;color:#666">${d.notes}</p>` : ''}
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
