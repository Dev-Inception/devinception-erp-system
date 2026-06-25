/**
 * Mock API client — a drop-in replacement for the old axios instance.
 *
 * There is NO backend and NO network. Every `api.get/post/patch/put/delete`
 * call is matched to an in-memory handler backed by `lib/mock-data.ts`, so the
 * whole app runs standalone on dummy data. Mutations update the in-memory store
 * and react-query re-reads it, so the UI stays consistent within a session.
 * Reloading the page resets to the seed data.
 */
import {
  db,
  uid,
  findProduct,
  productStock,
  partyOutstanding,
  type Product,
  type Sale,
  type SaleItem,
  type Purchase,
  type PurchaseItem,
} from './mock-data';
import { renderTemplate } from './printing';

interface ReqConfig {
  params?: Record<string, unknown>;
  responseType?: string;
}

const LATENCY = 120; // ms — small delay so loading states show

const ok = <T>(data: T): Promise<{ data: T }> =>
  new Promise((resolve) => setTimeout(() => resolve({ data }), LATENCY));

const fail = (status: number, message: string) =>
  Promise.reject({ response: { status, data: { statusCode: status, message } } });

const matches = (a: string, b?: unknown) =>
  !b || String(a ?? '').toLowerCase().includes(String(b).toLowerCase());

const startOfDay = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};
const startOfMonth = () => {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1);
};
const dayKey = (iso: string) => iso.slice(0, 10);

/* ─────────────────── view builders ─────────────────── */
function listProducts(search?: unknown, warehouseId?: unknown) {
  return db.products
    .filter((p) => p.isActive)
    .filter((p) => matches(p.name, search) || matches(p.sku, search) || matches(p.barcode ?? '', search))
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((p) => {
      const currentStock = productStock(p.id, warehouseId ? String(warehouseId) : undefined);
      const category = db.categories.find((c) => c.id === p.categoryId);
      const unit = db.units.find((u) => u.id === p.unitId);
      return {
        ...p,
        currentStock,
        isLowStock: currentStock <= p.minStock,
        category: category ? { id: category.id, name: category.name } : null,
        unit: unit ? { id: unit.id, abbreviation: unit.abbreviation } : null,
      };
    });
}

function listWarehouses() {
  return db.warehouses
    .slice()
    .sort((a, b) => Number(b.isDefault) - Number(a.isDefault) || a.name.localeCompare(b.name))
    .map((w) => {
      const items = db.products.filter((p) => productStock(p.id, w.id) !== 0);
      const stockValue = db.products.reduce((s, p) => s + productStock(p.id, w.id) * p.purchasePrice, 0);
      return { ...w, itemCount: items.length, stockValue };
    });
}

function listCustomers(search?: unknown) {
  return db.customers
    .filter((c) => c.id !== 'walk-in')
    .filter((c) => matches(c.name, search))
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((c) => ({ ...c, outstanding: partyOutstanding('customers', c.id) }));
}

function listVendors(search?: unknown) {
  return db.vendors
    .filter((v) => matches(v.name, search))
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((v) => ({ ...v, outstanding: partyOutstanding('vendors', v.id) }));
}

const customerName = (id?: string) => db.customers.find((c) => c.id === id)?.name;
const vendorName = (id?: string) => db.vendors.find((v) => v.id === id)?.name;

function listSales() {
  return db.sales
    .slice()
    .sort((a, b) => +new Date(b.date) - +new Date(a.date))
    .map((s) => ({ ...s, customer: s.customerId ? { name: customerName(s.customerId) } : undefined }));
}

function listInvoices() {
  return db.invoices
    .slice()
    .sort((a, b) => +new Date(b.issueDate) - +new Date(a.issueDate))
    .map((i) => ({ ...i, customer: { name: customerName(i.customerId) ?? 'Walk-in Customer' } }));
}

function cashLedger() {
  const sorted = db.cashTxns.slice().sort((a, b) => +new Date(a.date) - +new Date(b.date));
  let balance = 0;
  const rows = sorted.map((t) => {
    const inAmt = t.type === 'CASH_IN' ? t.amount : 0;
    const outAmt = t.type === 'CASH_OUT' ? t.amount : 0;
    balance += inAmt - outAmt;
    return { ...t, in: inAmt, out: outAmt, balanceAfter: balance };
  });
  return { balance, rows: rows.reverse() };
}

function partyLedger(kind: 'customers' | 'vendors', id: string) {
  const entries = db.ledger
    .filter((e) => e.accountKind === kind && e.accountId === id)
    .sort((a, b) => +new Date(a.date) - +new Date(b.date));
  let balance = 0;
  const rows = entries.map((e) => {
    balance += kind === 'customers' ? e.debit - e.credit : e.credit - e.debit;
    return { date: e.date, description: e.description, debit: e.debit, credit: e.credit, balanceAfter: balance };
  });
  return { balance, entries: rows };
}

function dashboardKpis() {
  const sod = +startOfDay();
  const som = +startOfMonth();
  const completed = db.sales.filter((s) => s.status === 'COMPLETED');
  const sum = (arr: Sale[]) => arr.reduce((s, x) => s + x.grandTotal, 0);
  return {
    todaySales: sum(completed.filter((s) => +new Date(s.date) >= sod)),
    monthSales: sum(completed.filter((s) => +new Date(s.date) >= som)),
    totalRevenue: sum(completed),
    totalExpenses: db.cashTxns.filter((t) => t.type === 'CASH_OUT').reduce((s, t) => s + t.amount, 0),
    stockValue: db.products.reduce((s, p) => s + productStock(p.id) * p.purchasePrice, 0),
    outstandingReceivables: db.customers.reduce((s, c) => s + Math.max(0, partyOutstanding('customers', c.id)), 0),
    outstandingPayables: db.vendors.reduce((s, v) => s + Math.max(0, partyOutstanding('vendors', v.id)), 0),
  };
}

function salesTrend(days = 30) {
  const since = +new Date(Date.now() - days * 86400000);
  const byDay = new Map<string, number>();
  for (const s of db.sales) {
    if (s.status !== 'COMPLETED' || +new Date(s.date) < since) continue;
    const k = dayKey(s.date);
    byDay.set(k, (byDay.get(k) ?? 0) + s.grandTotal);
  }
  return Array.from(byDay.entries())
    .map(([date, total]) => ({ date, total }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

function topProducts(limit = 5) {
  const agg = new Map<string, { quantity: number; revenue: number }>();
  for (const s of db.sales) {
    for (const it of s.items) {
      const cur = agg.get(it.productId) ?? { quantity: 0, revenue: 0 };
      cur.quantity += it.quantity;
      cur.revenue += it.amount;
      agg.set(it.productId, cur);
    }
  }
  return Array.from(agg.entries())
    .map(([productId, v]) => ({ productId, name: findProduct(productId)?.name ?? 'Unknown', ...v }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, limit);
}

function inRange(iso: string, from?: unknown, to?: unknown) {
  const t = +new Date(iso);
  if (from && t < +new Date(String(from))) return false;
  if (to && t > +new Date(`${String(to)}T23:59:59`)) return false;
  return true;
}

function buildReport(type: string, from?: unknown, to?: unknown) {
  if (type === 'sales') {
    const rows = db.sales
      .filter((s) => s.status === 'COMPLETED' && inRange(s.date, from, to))
      .sort((a, b) => +new Date(b.date) - +new Date(a.date))
      .map((s) => ({
        saleNumber: s.saleNumber,
        date: dayKey(s.date),
        customer: customerName(s.customerId) ?? 'Walk-in',
        payment: s.paymentMethod,
        cash: s.paidCash,
        online: s.paidBank,
        total: s.grandTotal,
      }));
    return {
      title: 'Sales Report',
      columns: [
        { key: 'saleNumber', label: 'Sale #' },
        { key: 'date', label: 'Date' },
        { key: 'customer', label: 'Customer' },
        { key: 'payment', label: 'Payment' },
        { key: 'cash', label: 'Cash', numeric: true },
        { key: 'online', label: 'Online', numeric: true },
        { key: 'total', label: 'Total', numeric: true },
      ],
      rows,
      summary: {
        count: rows.length,
        cash: rows.reduce((s, r) => s + r.cash, 0),
        online: rows.reduce((s, r) => s + r.online, 0),
        total: rows.reduce((s, r) => s + r.total, 0),
      },
    };
  }
  if (type === 'purchases') {
    const rows = db.purchases
      .filter((p) => inRange(p.date, from, to))
      .sort((a, b) => +new Date(b.date) - +new Date(a.date))
      .map((p) => ({ gpNumber: p.gpNumber, date: dayKey(p.date), vendor: vendorName(p.vendorId) ?? '—', paid: p.paidAmount, total: p.grandTotal }));
    return {
      title: 'Purchase Report',
      columns: [
        { key: 'gpNumber', label: 'GP #' },
        { key: 'date', label: 'Date' },
        { key: 'vendor', label: 'Vendor' },
        { key: 'paid', label: 'Paid', numeric: true },
        { key: 'total', label: 'Total', numeric: true },
      ],
      rows,
      summary: { count: rows.length, paid: rows.reduce((s, r) => s + r.paid, 0), total: rows.reduce((s, r) => s + r.total, 0) },
    };
  }
  if (type === 'stock') {
    const rows = db.products
      .filter((p) => p.isActive)
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((p) => {
        const qty = productStock(p.id);
        const unit = db.units.find((u) => u.id === p.unitId);
        return {
          name: p.name,
          sku: p.sku,
          qty,
          unit: unit?.abbreviation ?? '',
          purchasePrice: p.purchasePrice,
          value: qty * p.purchasePrice,
          lowStock: qty <= p.minStock ? 'YES' : '',
        };
      });
    return {
      title: 'Stock Valuation',
      columns: [
        { key: 'name', label: 'Product' },
        { key: 'sku', label: 'SKU' },
        { key: 'qty', label: 'Qty', numeric: true },
        { key: 'unit', label: 'Unit' },
        { key: 'purchasePrice', label: 'Cost', numeric: true },
        { key: 'value', label: 'Stock Value', numeric: true },
        { key: 'lowStock', label: 'Low?' },
      ],
      rows,
      summary: { products: rows.length, totalQty: rows.reduce((s, r) => s + r.qty, 0), totalValue: rows.reduce((s, r) => s + r.value, 0) },
    };
  }
  // pnl
  const sales = db.sales.filter((s) => s.status === 'COMPLETED' && inRange(s.date, from, to));
  const revenue = sales.reduce((s, x) => s + x.grandTotal, 0);
  const cogs = sales.reduce((s, x) => s + x.items.reduce((t, i) => t + i.quantity * (findProduct(i.productId)?.purchasePrice ?? 0), 0), 0);
  const expenses = db.cashTxns.filter((t) => t.type === 'CASH_OUT' && inRange(t.date, from, to)).reduce((s, t) => s + t.amount, 0);
  const grossProfit = revenue - cogs;
  const netProfit = grossProfit - expenses;
  return {
    title: 'Profit & Loss',
    columns: [
      { key: 'item', label: 'Item' },
      { key: 'amount', label: 'Amount', numeric: true },
    ],
    rows: [
      { item: 'Revenue (Sales)', amount: revenue },
      { item: 'Cost of Goods Sold', amount: -cogs },
      { item: 'Gross Profit', amount: grossProfit },
      { item: 'Operating Expenses', amount: -expenses },
      { item: 'Net Profit', amount: netProfit },
    ],
    summary: { revenue, cogs, grossProfit, expenses, netProfit },
  };
}

function invoicePdfBlob(id: string): Blob {
  const inv = db.invoices.find((i) => i.id === id);
  const sale = inv ? db.sales.find((s) => s.id === inv.saleId) : undefined;
  const items = (sale?.items ?? []).map((i) => ({ name: i.name, qty: i.quantity, price: i.unitPrice, amount: i.amount }));
  const html = renderTemplate('INVOICE_A4', {
    company: { name: db.settings.companyName, address: db.settings.address, phone: db.settings.phone },
    number: inv?.invoiceNumber ?? 'INV',
    date: inv ? new Date(inv.issueDate).toLocaleDateString() : '',
    partyName: inv ? customerName(inv.customerId) ?? 'Walk-in Customer' : '',
    items,
    subtotal: inv?.subtotal ?? 0,
    tax: inv?.taxTotal ?? 0,
    discount: inv?.discountTotal ?? 0,
    total: inv?.grandTotal ?? 0,
  });
  // Served as HTML so it opens in a new tab (demo stand-in for a rendered PDF).
  return new Blob([html], { type: 'text/html' });
}

/* ─────────────────── mutations ─────────────────── */
function createSale(body: any) {
  const warehouseId = body.warehouseId || db.warehouses.find((w) => w.isDefault)?.id || db.warehouses[0].id;
  let subtotal = 0;
  let taxTotal = 0;
  const items: SaleItem[] = (body.items ?? []).map((it: any) => {
    const product = findProduct(it.productId);
    const gross = it.quantity * it.unitPrice;
    const discount = it.discount ?? 0;
    const taxable = gross - discount;
    const taxRate = it.taxRate ?? product?.taxRate ?? 0;
    const tax = (taxable * taxRate) / 100;
    subtotal += gross;
    taxTotal += tax;
    return { productId: it.productId, name: product?.name ?? 'Item', quantity: it.quantity, unitPrice: it.unitPrice, discount, taxRate, amount: taxable + tax };
  });
  const discountTotal = body.discountTotal ?? 0;
  const grandTotal = subtotal - discountTotal + taxTotal;
  const paidCash = body.paidCash ?? 0;
  const paidBank = body.paidBank ?? 0;
  const sale: Sale = {
    id: uid('sale'),
    saleNumber: `SALE-${new Date().getFullYear()}-${String(db.seq.SALE++).padStart(6, '0')}`,
    customerId: body.customerId,
    warehouseId,
    date: new Date().toISOString(),
    status: 'COMPLETED',
    subtotal,
    discountTotal,
    taxTotal,
    grandTotal,
    paymentMethod: body.paymentMethod,
    paidCash,
    paidCard: 0,
    paidBank,
    changeDue: Math.max(0, paidCash + paidBank - grandTotal),
    items,
  };
  db.sales.push(sale);
  for (const it of items) {
    db.stock[it.productId] = db.stock[it.productId] || {};
    db.stock[it.productId][warehouseId] = (db.stock[it.productId][warehouseId] ?? 0) - it.quantity;
  }
  if (paidCash > 0) db.cashTxns.push({ id: uid('cash'), type: 'CASH_IN', amount: paidCash, description: `POS sale ${sale.saleNumber}`, date: sale.date });
  const onCredit = grandTotal - paidCash - paidBank;
  if (onCredit > 0.01 && body.customerId) {
    db.ledger.push({ accountKind: 'customers', accountId: body.customerId, date: sale.date, description: `Credit sale ${sale.saleNumber}`, debit: onCredit, credit: 0 });
  }
  return { ...sale, customer: body.customerId ? { name: customerName(body.customerId) } : undefined };
}

function createPurchase(body: any) {
  const warehouseId = body.warehouseId || db.warehouses.find((w) => w.isDefault)?.id || db.warehouses[0].id;
  let subtotal = 0;
  let taxTotal = 0;
  const items: PurchaseItem[] = (body.items ?? []).map((it: any) => {
    const product = findProduct(it.productId);
    const gross = it.quantity * it.rate;
    const discount = it.discount ?? 0;
    const taxable = gross - discount;
    const taxRate = it.taxRate ?? 0;
    const tax = (taxable * taxRate) / 100;
    subtotal += gross;
    taxTotal += tax;
    if (product) product.purchasePrice = it.rate;
    return { productId: it.productId, name: product?.name ?? 'Item', quantity: it.quantity, rate: it.rate, taxRate, discount, amount: taxable + tax };
  });
  const discountTotal = body.discountTotal ?? 0;
  const grandTotal = subtotal - discountTotal + taxTotal;
  const paidAmount = Math.min(body.paidAmount ?? 0, grandTotal);
  const gp: Purchase = {
    id: uid('gp'),
    gpNumber: `GP-${new Date().getFullYear()}-${String(db.seq.GP++).padStart(4, '0')}`,
    vendorId: body.vendorId,
    warehouseId,
    invoiceNumber: body.invoiceNumber,
    date: body.date ? new Date(body.date).toISOString() : new Date().toISOString(),
    status: 'RECEIVED',
    subtotal,
    taxTotal,
    discountTotal,
    grandTotal,
    paidAmount,
    items,
  };
  db.purchases.push(gp);
  for (const it of items) {
    db.stock[it.productId] = db.stock[it.productId] || {};
    db.stock[it.productId][warehouseId] = (db.stock[it.productId][warehouseId] ?? 0) + it.quantity;
  }
  const owed = grandTotal - paidAmount;
  if (owed > 0.01) db.ledger.push({ accountKind: 'vendors', accountId: body.vendorId, date: gp.date, description: `Goods purchase ${gp.gpNumber}`, debit: 0, credit: owed });
  if (paidAmount > 0) db.cashTxns.push({ id: uid('cash'), type: 'CASH_OUT', amount: paidAmount, description: `Payment for ${gp.gpNumber}`, date: gp.date });
  return { ...gp, vendor: { name: vendorName(body.vendorId) }, items: items.map((i) => ({ ...i, product: { name: i.name } })) };
}

function adjustStock(body: any) {
  const { productId, warehouseId, type, quantity } = body;
  db.stock[productId] = db.stock[productId] || {};
  const current = db.stock[productId][warehouseId] ?? 0;
  let delta = 0;
  if (type === 'STOCK_IN') delta = quantity;
  else if (type === 'STOCK_OUT' || type === 'DAMAGED') delta = -quantity;
  else if (type === 'ADJUSTMENT') delta = quantity - current;
  const newQty = current + delta;
  if (newQty < 0) return fail(400, 'Resulting stock cannot be negative');
  db.stock[productId][warehouseId] = newQty;
  return { newQty };
}

function createInvoice(body: any) {
  const sale = db.sales.find((s) => s.id === body.saleId);
  if (!sale) return fail(404, 'Sale not found');
  const existing = db.invoices.find((i) => i.saleId === sale.id);
  if (existing) return existing;
  const paid = sale.paidCash + sale.paidCard + sale.paidBank;
  const inv = {
    id: uid('inv'),
    invoiceNumber: `INV-${new Date().getFullYear()}-${String(db.seq.INV++).padStart(6, '0')}`,
    saleId: sale.id,
    customerId: sale.customerId ?? 'walk-in',
    status: paid >= sale.grandTotal ? 'PAID' : 'ISSUED',
    issueDate: new Date().toISOString(),
    subtotal: sale.subtotal,
    taxTotal: sale.taxTotal,
    discountTotal: sale.discountTotal,
    grandTotal: sale.grandTotal,
    paidAmount: paid,
  };
  db.invoices.push(inv);
  return { ...inv, customer: { name: customerName(inv.customerId) ?? 'Walk-in Customer' } };
}

/* ─────────────────── router ─────────────────── */
async function handle(method: string, url: string, body?: any, config?: ReqConfig): Promise<{ data: any }> {
  const params = config?.params ?? {};
  const seg = url.split('/').filter(Boolean); // e.g. ['invoices','abc','pdf']

  /* GET */
  if (method === 'get') {
    if (url === '/warehouses') return ok(listWarehouses());
    if (url === '/products') return ok(listProducts(params.search, params.warehouseId));
    if (url === '/catalog') return ok({ categories: db.categories, brands: db.brands, units: db.units });
    if (url === '/customers') return ok(listCustomers(params.search));
    if (url === '/vendors') return ok(listVendors(params.search));
    if (url === '/sales') return ok(listSales());
    if (url === '/invoices') return ok(listInvoices());
    if (url === '/cash') return ok(cashLedger());
    if (url === '/bank/accounts') return ok(db.bankAccounts);
    if (url === '/settings') return ok(db.settings);
    if (url === '/dashboard/kpis') return ok(dashboardKpis());
    if (url === '/dashboard/sales-trend') return ok(salesTrend(Number(params.days) || 30));
    if (url === '/dashboard/top-products') return ok(topProducts(Number(params.limit) || 5));
    if (seg[0] === 'reports' && seg[1]) return ok(buildReport(seg[1], params.from, params.to));
    if (seg[0] === 'invoices' && seg[2] === 'pdf') return ok(invoicePdfBlob(seg[1]));
    if ((seg[0] === 'customers' || seg[0] === 'vendors') && seg[2] === 'ledger')
      return ok(partyLedger(seg[0] as 'customers' | 'vendors', seg[1]));
  }

  /* POST */
  if (method === 'post') {
    if (url === '/sales') return ok(createSale(body));
    if (url === '/purchases') return ok(createPurchase(body));
    if (url === '/stock/adjust') return ok(await adjustStock(body));
    if (url === '/invoices') return ok(await createInvoice(body));
    if (url === '/uploads') {
      const file = body instanceof FormData ? (body.get('file') as File | null) : null;
      return ok({ url: `/uploads/mock-${uid('file')}`, name: file?.name ?? 'receipt', size: file?.size ?? 0 });
    }
    if (url === '/customers') {
      const c = { id: uid('cust'), creditLimit: 0, openingBalance: 0, ...body };
      db.customers.push(c);
      return ok({ ...c, outstanding: 0 });
    }
    if (url === '/vendors') {
      const v = { id: uid('ven'), openingBalance: 0, ...body };
      db.vendors.push(v);
      return ok({ ...v, outstanding: 0 });
    }
    if (url === '/warehouses') {
      const makeDefault = body.isDefault || db.warehouses.length === 0;
      if (makeDefault) db.warehouses.forEach((w) => (w.isDefault = false));
      const w = { id: uid('wh'), name: body.name, location: body.location, isDefault: makeDefault };
      db.warehouses.push(w);
      return ok(w);
    }
    if (url === '/cash') {
      const t = { id: uid('cash'), type: body.type, amount: body.amount, description: body.description, date: new Date().toISOString() };
      db.cashTxns.push(t);
      return ok(t);
    }
    if (url === '/bank/accounts') {
      const a = { id: uid('bank'), name: body.name, bankName: body.bankName, balance: 0 };
      db.bankAccounts.push(a);
      return ok(a);
    }
    if (url === '/bank/transactions') {
      const acct = db.bankAccounts.find((a) => a.id === body.bankAccountId);
      if (acct) acct.balance += body.type === 'DEPOSIT' ? body.amount : -body.amount;
      return ok({ id: uid('btxn'), ...body });
    }
    if (seg[0] === 'warehouses' && seg[2] === 'set-default') {
      db.warehouses.forEach((w) => (w.isDefault = w.id === seg[1]));
      return ok({ success: true });
    }
    if (seg[0] === 'invoices' && seg[2] === 'send-email') {
      const inv = db.invoices.find((i) => i.id === seg[1]);
      const email = inv && db.customers.find((c) => c.id === inv.customerId)?.email;
      return ok({ sent: false, message: email ? `Demo mode: email to ${email} is simulated (no SMTP configured).` : 'Customer has no email address.' });
    }
    if (seg[0] === 'invoices' && seg[2] === 'send-whatsapp') {
      const inv = db.invoices.find((i) => i.id === seg[1]);
      const phone = (inv && db.customers.find((c) => c.id === inv.customerId)?.phone) || '';
      const digits = phone.replace(/[^0-9]/g, '');
      const text = encodeURIComponent(`Hello, here is your invoice ${inv?.invoiceNumber ?? ''} from ${db.settings.companyName}.`);
      return ok({ url: `https://wa.me/${digits}?text=${text}`, hasPhone: digits.length > 0 });
    }
    if (url === '/products') {
      const p: Product = { id: uid('prod'), isActive: true, taxRate: 0, minStock: 0, purchasePrice: 0, salePrice: 0, ...body };
      db.products.push(p);
      db.stock[p.id] = {};
      return ok(p);
    }
  }

  /* PATCH */
  if (method === 'patch') {
    if (seg[0] === 'products' && seg[1]) {
      const p = findProduct(seg[1]);
      if (!p) return fail(404, 'Product not found');
      Object.assign(p, body);
      return ok(p);
    }
  }

  /* PUT */
  if (method === 'put') {
    if (url === '/settings') {
      Object.assign(db.settings, body);
      return ok(db.settings);
    }
  }

  return fail(404, `No mock handler for ${method.toUpperCase()} ${url}`);
}

/* axios-compatible surface used across the app */
export const api = {
  get: (url: string, config?: ReqConfig) => handle('get', url, undefined, config),
  post: (url: string, body?: any, config?: ReqConfig) => handle('post', url, body, config),
  patch: (url: string, body?: any, config?: ReqConfig) => handle('patch', url, body, config),
  put: (url: string, body?: any, config?: ReqConfig) => handle('put', url, body, config),
  delete: (url: string, config?: ReqConfig) => handle('delete', url, undefined, config),
};
