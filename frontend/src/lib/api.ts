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
import { http } from './http';

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
  !b ||
  String(a ?? '')
    .toLowerCase()
    .includes(String(b).toLowerCase());

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
    .filter(
      (p) => matches(p.name, search) || matches(p.sku, search) || matches(p.barcode ?? '', search),
    )
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
      const stockValue = db.products.reduce(
        (s, p) => s + productStock(p.id, w.id) * p.purchasePrice,
        0,
      );
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
    .map((s) => ({
      ...s,
      customer: s.customerId ? { name: customerName(s.customerId) } : undefined,
    }));
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
    return {
      date: e.date,
      description: e.description,
      debit: e.debit,
      credit: e.credit,
      balanceAfter: balance,
    };
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
    totalExpenses: db.cashTxns
      .filter((t) => t.type === 'CASH_OUT')
      .reduce((s, t) => s + t.amount, 0),
    stockValue: db.products.reduce((s, p) => s + productStock(p.id) * p.purchasePrice, 0),
    outstandingReceivables: db.customers.reduce(
      (s, c) => s + Math.max(0, partyOutstanding('customers', c.id)),
      0,
    ),
    outstandingPayables: db.vendors.reduce(
      (s, v) => s + Math.max(0, partyOutstanding('vendors', v.id)),
      0,
    ),
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
      .map((p) => ({
        gpNumber: p.gpNumber,
        date: dayKey(p.date),
        vendor: vendorName(p.vendorId) ?? '—',
        paid: p.paidAmount,
        total: p.grandTotal,
      }));
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
      summary: {
        count: rows.length,
        paid: rows.reduce((s, r) => s + r.paid, 0),
        total: rows.reduce((s, r) => s + r.total, 0),
      },
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
      summary: {
        products: rows.length,
        totalQty: rows.reduce((s, r) => s + r.qty, 0),
        totalValue: rows.reduce((s, r) => s + r.value, 0),
      },
    };
  }
  // pnl
  const sales = db.sales.filter((s) => s.status === 'COMPLETED' && inRange(s.date, from, to));
  const revenue = sales.reduce((s, x) => s + x.grandTotal, 0);
  const cogs = sales.reduce(
    (s, x) =>
      s +
      x.items.reduce((t, i) => t + i.quantity * (findProduct(i.productId)?.purchasePrice ?? 0), 0),
    0,
  );
  const expenses = db.cashTxns
    .filter((t) => t.type === 'CASH_OUT' && inRange(t.date, from, to))
    .reduce((s, t) => s + t.amount, 0);
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
  const items = (sale?.items ?? []).map((i) => ({
    name: i.name,
    qty: i.quantity,
    price: i.unitPrice,
    amount: i.amount,
  }));
  const html = renderTemplate('INVOICE_A4', {
    company: {
      name: db.settings.companyName,
      address: db.settings.address,
      phone: db.settings.phone,
    },
    number: inv?.invoiceNumber ?? 'INV',
    date: inv ? new Date(inv.issueDate).toLocaleDateString() : '',
    partyName: inv ? (customerName(inv.customerId) ?? 'Walk-in Customer') : '',
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
  const warehouseId =
    body.warehouseId || db.warehouses.find((w) => w.isDefault)?.id || db.warehouses[0].id;
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
    return {
      productId: it.productId,
      name: product?.name ?? 'Item',
      quantity: it.quantity,
      unitPrice: it.unitPrice,
      discount,
      taxRate,
      amount: taxable + tax,
    };
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
  if (paidCash > 0)
    db.cashTxns.push({
      id: uid('cash'),
      type: 'CASH_IN',
      amount: paidCash,
      description: `POS sale ${sale.saleNumber}`,
      date: sale.date,
    });
  const onCredit = grandTotal - paidCash - paidBank;
  if (onCredit > 0.01 && body.customerId) {
    db.ledger.push({
      accountKind: 'customers',
      accountId: body.customerId,
      date: sale.date,
      description: `Credit sale ${sale.saleNumber}`,
      debit: onCredit,
      credit: 0,
    });
  }
  return {
    ...sale,
    customer: body.customerId ? { name: customerName(body.customerId) } : undefined,
  };
}

function createPurchase(body: any) {
  const warehouseId =
    body.warehouseId || db.warehouses.find((w) => w.isDefault)?.id || db.warehouses[0].id;
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
    return {
      productId: it.productId,
      name: product?.name ?? 'Item',
      quantity: it.quantity,
      rate: it.rate,
      taxRate,
      discount,
      amount: taxable + tax,
    };
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
    note: body.notes || undefined,
    items,
  };
  db.purchases.push(gp);
  for (const it of items) {
    db.stock[it.productId] = db.stock[it.productId] || {};
    db.stock[it.productId][warehouseId] = (db.stock[it.productId][warehouseId] ?? 0) + it.quantity;
  }
  const owed = grandTotal - paidAmount;
  if (owed > 0.01)
    db.ledger.push({
      accountKind: 'vendors',
      accountId: body.vendorId,
      date: gp.date,
      description: `Goods purchase ${gp.gpNumber}`,
      debit: 0,
      credit: owed,
    });
  if (paidAmount > 0)
    db.cashTxns.push({
      id: uid('cash'),
      type: 'CASH_OUT',
      amount: paidAmount,
      description: `Payment for ${gp.gpNumber}`,
      date: gp.date,
    });
  return {
    ...gp,
    vendor: { name: vendorName(body.vendorId) },
    items: items.map((i) => ({ ...i, product: { name: i.name } })),
  };
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
async function handle(
  method: string,
  url: string,
  body?: any,
  config?: ReqConfig,
): Promise<{ data: any }> {
  const params = config?.params ?? {};
  const seg = url.split('/').filter(Boolean); // e.g. ['invoices','abc','pdf']

  /* GET */
  if (method === 'get') {
    if (url === '/warehouses') return ok(listWarehouses());
    if (url === '/products') return ok(listProducts(params.search, params.warehouseId));
    if (url === '/catalog')
      return ok({ categories: db.categories, brands: db.brands, units: db.units });
    if (url === '/categories') return ok(db.categories);
    if (url === '/units') return ok(db.units);
    if (url === '/labour') return ok(db.labour);
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
      return ok({
        url: `/uploads/mock-${uid('file')}`,
        name: file?.name ?? 'receipt',
        size: file?.size ?? 0,
      });
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
    if (url === '/categories') {
      const c = { id: uid('cat'), name: body.name, description: body.description || undefined };
      db.categories.push(c);
      return ok(c);
    }
    if (url === '/units') {
      const u = { id: uid('unit'), name: body.name, abbreviation: body.abbreviation || body.name };
      db.units.push(u);
      return ok(u);
    }
    if (url === '/labour') {
      const l = { id: uid('lb'), name: body.name, phoneNumber: body.phoneNumber };
      db.labour.push(l);
      return ok(l);
    }
    if (url === '/cash') {
      const t = {
        id: uid('cash'),
        type: body.type,
        amount: body.amount,
        description: body.description,
        date: new Date().toISOString(),
      };
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
      return ok({
        sent: false,
        message: email
          ? `Demo mode: email to ${email} is simulated (no SMTP configured).`
          : 'Customer has no email address.',
      });
    }
    if (seg[0] === 'invoices' && seg[2] === 'send-whatsapp') {
      const inv = db.invoices.find((i) => i.id === seg[1]);
      const phone = (inv && db.customers.find((c) => c.id === inv.customerId)?.phone) || '';
      const digits = phone.replace(/[^0-9]/g, '');
      const text = encodeURIComponent(
        `Hello, here is your invoice ${inv?.invoiceNumber ?? ''} from ${db.settings.companyName}.`,
      );
      return ok({ url: `https://wa.me/${digits}?text=${text}`, hasPhone: digits.length > 0 });
    }
    if (url === '/products') {
      const p: Product = {
        id: uid('prod'),
        isActive: true,
        taxRate: 0,
        minStock: 0,
        purchasePrice: 0,
        salePrice: 0,
        ...body,
      };
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

/* ══════════════════════════════════════════════════════════════════════
 * REAL BACKEND ADAPTERS (migrated modules)
 *
 * Each migrated endpoint calls the real backend (`http`) and maps the response
 * to the exact shape the pages already consume, so no page/UI changes. Anything
 * not matched here falls through to the in-memory mock above. Migrate a module
 * by adding its routes to `tryReal`.
 *
 * Migrated so far: Inventory — Warehouses, Products, Catalog (Categories, Units), Stock adjust;
 * Partners — Labour.
 * ══════════════════════════════════════════════════════════════════════ */
const wrap = <T>(data: T) => ({ data });

/* ── Warehouses ── */
function mapWarehouse(w: any) {
  return {
    id: String(w._id ?? w.id),
    name: w.name,
    location: w.location || undefined,
    isDefault: !!w.isDefault,
    itemCount: w.itemsInStock ?? 0,
    stockValue: w.stockValue ?? 0, // backend already serializes to rupees
  };
}
async function realWarehouses() {
  const res = await http.get('/warehouses');
  return (res.data.warehouses as any[]).map(mapWarehouse);
}
async function realCreateWarehouse(body: any) {
  const res = await http.post('/warehouses', {
    name: body.name,
    location: body.location,
    isDefault: !!body.isDefault,
  });
  return mapWarehouse(res.data.warehouse);
}
async function realSetDefaultWarehouse(id: string) {
  // No /set-default route on the backend — PATCH with isDefault=true does it.
  await http.patch(`/warehouses/${id}`, { isDefault: true });
  return { success: true };
}
async function realUpdateWarehouse(id: string, body: any) {
  const res = await http.patch(`/warehouses/${id}`, {
    name: body.name,
    location: body.location,
  });
  return mapWarehouse(res.data.warehouse);
}
async function realDeleteWarehouse(id: string) {
  await http.delete(`/warehouses/${id}`);
  return { success: true };
}

/* ── Products ── */
function mapProduct(p: any) {
  return {
    id: String(p._id ?? p.id),
    name: p.name,
    sku: p.sku,
    barcode: p.barcode || undefined,
    salePrice: p.salePrice, // backend serializes money to rupees
    purchasePrice: p.purchasePrice,
    taxRate: p.taxPercent ?? 0,
    minStock: p.minStock ?? 0,
    currentStock: p.stock ?? 0,
    isLowStock: !!p.lowStock,
    // Backend serializes catalog refs as { id, name(, abbreviation) } objects
    // plus matching *Id fields; pass them straight through so the edit-form
    // dropdowns round-trip on the catalog id.
    categoryId: p.categoryId || undefined,
    unitId: p.unitId || undefined,
    // The product's own owning warehouse (set once at creation) — stock
    // adjustments must target this exact warehouse, not whatever is globally
    // "current", or the backend rejects with "belongs to another warehouse".
    warehouseId: p.warehouseId || undefined,
    category: p.category ? { id: p.category.id, name: p.category.name } : null,
    unit: p.unit
      ? { id: p.unit.id, name: p.unit.name, abbreviation: p.unit.abbreviation || p.unit.name }
      : null,
  };
}
async function realFetchProducts(params: { search?: unknown; warehouse?: unknown }) {
  const res = await http.get('/products', {
    params: {
      search: params.search || undefined,
      warehouse: params.warehouse || undefined,
      limit: 100,
    },
  });
  return res.data.products as any[];
}
async function realProductsList(params: any) {
  const products = await realFetchProducts({
    search: params.search,
    warehouse: params.warehouseId,
  });
  return products.map(mapProduct);
}
function productPayload(body: any) {
  // FE → backend field mapping. Catalog refs are real catalog ids, so send them
  // as *Id fields (the backend resolves refs by id); taxRate→taxPercent.
  // warehouseId is required on create (a product belongs to one warehouse) and
  // unused on update, so it's simply omitted there (undefined).
  return {
    name: body.name,
    sku: body.sku,
    barcode: body.barcode,
    categoryId: body.categoryId || undefined,
    unitId: body.unitId || undefined,
    warehouseId: body.warehouseId || undefined,
    purchasePrice: body.purchasePrice,
    salePrice: body.salePrice,
    taxPercent: body.taxRate,
    minStock: body.minStock,
  };
}
async function realCreateProduct(body: any) {
  const res = await http.post('/products', productPayload(body));
  return mapProduct(res.data.product);
}
async function realUpdateProduct(id: string, body: any) {
  const res = await http.patch(`/products/${id}`, productPayload(body));
  return mapProduct(res.data.product);
}

/* ── Catalog: real Category/Brand/Unit entities from the backend ── */
async function realCatalog() {
  // { categories:[{id,name}], brands:[{id,name}], units:[{id,name,abbreviation}] }
  return (await http.get('/catalog')).data;
}

/* ── Categories (catalog entries used to classify products) ── */
function mapCategory(c: any) {
  return { id: String(c._id ?? c.id), name: c.name, description: c.description || undefined };
}
async function realCategories() {
  const res = await http.get('/catalog/categories');
  return (res.data.categories as any[]).map(mapCategory);
}
async function realCreateCategory(body: any) {
  const res = await http.post('/catalog/categories', {
    name: body.name,
    description: body.description,
  });
  return mapCategory(res.data.category);
}
async function realUpdateCategory(id: string, body: any) {
  const res = await http.patch(`/catalog/categories/${id}`, {
    name: body.name,
    description: body.description,
  });
  return mapCategory(res.data.category);
}
async function realDeleteCategory(id: string) {
  await http.delete(`/catalog/categories/${id}`);
  return { success: true };
}

/* ── Units (of measurement, used to classify products) ── */
function mapUnitEntry(u: any) {
  return {
    id: String(u._id ?? u.id),
    name: u.name,
    abbreviation: u.abbreviation || u.name,
  };
}
async function realUnits() {
  const res = await http.get('/catalog/units');
  return (res.data.units as any[]).map(mapUnitEntry);
}
async function realCreateUnit(body: any) {
  const res = await http.post('/catalog/units', {
    name: body.name,
    abbreviation: body.abbreviation,
  });
  return mapUnitEntry(res.data.unit);
}
async function realUpdateUnit(id: string, body: any) {
  const res = await http.patch(`/catalog/units/${id}`, {
    name: body.name,
    abbreviation: body.abbreviation,
  });
  return mapUnitEntry(res.data.unit);
}
async function realDeleteUnit(id: string) {
  await http.delete(`/catalog/units/${id}`);
  return { success: true };
}

/* ── Labour (a standalone /labour master, not nested under /catalog) ── */
function mapLabour(l: any) {
  return { id: String(l._id ?? l.id), name: l.name, phoneNumber: l.phoneNumber };
}
async function realLabourList() {
  const res = await http.get('/labour');
  return (res.data.labour as any[]).map(mapLabour);
}
async function realCreateLabour(body: any) {
  const res = await http.post('/labour', { name: body.name, phoneNumber: body.phoneNumber });
  return mapLabour(res.data.labour);
}
async function realUpdateLabour(id: string, body: any) {
  const res = await http.patch(`/labour/${id}`, {
    name: body.name,
    phoneNumber: body.phoneNumber,
  });
  return mapLabour(res.data.labour);
}
async function realDeleteLabour(id: string) {
  await http.delete(`/labour/${id}`);
  return { success: true };
}

/* ── Stock adjust: FE type/quantity → backend signed delta + unit cost ── */
async function realAdjustStock(body: any) {
  const { productId, warehouseId, type, quantity, note } = body;
  const qty = Number(quantity) || 0;

  // Need current on-hand (for ADJUSTMENT delta + to report newQty) and the
  // purchase price (the FE adjust UI captures no cost, but the backend values
  // received stock at unit cost). Pull both from the warehouse's product list.
  const products = await realFetchProducts({ warehouse: warehouseId });
  const p = products.find((x) => String(x._id) === String(productId));
  const currentQty = p?.stock ?? 0;

  let delta = 0;
  if (type === 'STOCK_IN') delta = qty;
  else if (type === 'STOCK_OUT' || type === 'DAMAGED') delta = -qty;
  else if (type === 'ADJUSTMENT') delta = qty - currentQty;

  if (delta === 0) return { newQty: currentQty }; // backend rejects a zero delta

  await http.post(`/products/${productId}/adjust-stock`, {
    warehouse: warehouseId,
    delta,
    unitCost: delta > 0 ? (p?.purchasePrice ?? 0) : undefined,
    note: note || undefined,
  });
  return { newQty: currentQty + delta };
}

/* ── Customers ── */
function mapCustomer(c: any) {
  return {
    id: String(c._id ?? c.id),
    name: c.name,
    phone: c.phone || undefined,
    email: c.email || undefined,
    address: c.address || undefined,
    creditLimit: c.creditLimit ?? 0, // round-trips in rupees
    outstanding: c.outstanding ?? 0, // backend serializes to rupees (live AR)
  };
}
async function realCustomers(params: any) {
  const res = await http.get('/customers', {
    params: { search: params.search || undefined, limit: 100 },
  });
  return (res.data.customers as any[]).map(mapCustomer);
}
async function realCreateCustomer(body: any) {
  const res = await http.post('/customers', {
    name: body.name,
    phone: body.phone,
    email: body.email,
    address: body.address,
    creditLimit: body.creditLimit,
  });
  return mapCustomer(res.data.customer);
}
async function realUpdateCustomer(id: string, body: any) {
  const res = await http.patch(`/customers/${id}`, {
    name: body.name,
    phone: body.phone,
    email: body.email,
    address: body.address,
    creditLimit: body.creditLimit,
  });
  return mapCustomer(res.data.customer);
}
async function realDeleteCustomer(id: string) {
  await http.delete(`/customers/${id}`);
  return { success: true };
}

/* ── Vendors ── */
function mapVendor(v: any) {
  return {
    id: String(v._id ?? v.id),
    name: v.name,
    phone: v.phone || undefined,
    email: v.email || undefined,
    address: v.address || undefined,
    ntn: v.ntn || undefined,
    outstanding: v.outstanding ?? 0, // backend serializes to rupees (live AP)
  };
}
async function realVendors(params: any) {
  const res = await http.get('/vendors', {
    params: { search: params.search || undefined, limit: 100 },
  });
  return (res.data.vendors as any[]).map(mapVendor);
}
async function realCreateVendor(body: any) {
  const res = await http.post('/vendors', {
    name: body.name,
    phone: body.phone,
    email: body.email,
    address: body.address,
    ntn: body.ntn,
  });
  return mapVendor(res.data.vendor);
}
async function realUpdateVendor(id: string, body: any) {
  const res = await http.patch(`/vendors/${id}`, {
    name: body.name,
    phone: body.phone,
    email: body.email,
    address: body.address,
    ntn: body.ntn,
  });
  return mapVendor(res.data.vendor);
}
async function realDeleteVendor(id: string) {
  await http.delete(`/vendors/${id}`);
  return { success: true };
}

/* ── Sales / POS ── */
function mapSale(s: any) {
  const cname =
    s.customer && typeof s.customer === 'object' && s.customer.name
      ? s.customer.name
      : s.customerName;
  return {
    id: String(s._id ?? s.id),
    saleNumber: s.number,
    customerId: s.customer ? String(s.customer._id ?? s.customer) : undefined,
    warehouseId: s.warehouse ? String(s.warehouse._id ?? s.warehouse) : undefined,
    date: s.date,
    status: 'COMPLETED',
    subtotal: s.subtotal,
    discountTotal: s.discount,
    taxTotal: s.tax,
    grandTotal: s.total,
    paymentMethod: s.paymentMethod,
    paidCash: s.cashAmount ?? 0,
    paidCard: 0,
    paidBank: s.onlineAmount ?? 0,
    changeDue: 0,
    items: (s.items ?? []).map((it: any) => ({
      productId: String(it.product?._id ?? it.product),
      name: it.name,
      quantity: it.quantity,
      unitPrice: it.unitPrice,
      discount: 0,
      taxRate: s.taxPercent ?? 0,
      amount: it.lineTotal,
    })),
    customer: cname ? { name: cname } : undefined,
    gatePassId: s.gatePassId,
    gatePassUrl: s.gatePassUrl,
    gatePassQrUrl: s.gatePassQrUrl,
  };
}
async function realSales() {
  const res = await http.get('/sales', { params: { limit: 100 } });
  return (res.data.sales as any[]).map(mapSale);
}
async function realCreateSale(body: any) {
  // POS (flat) → backend (nested payment). The POS sends one tax rate per line;
  // the backend applies a single order-level taxPercent on the net.
  const items = (body.items ?? []).map((l: any) => ({
    product: l.productId,
    quantity: l.quantity,
    unitPrice: l.unitPrice,
  }));
  const res = await http.post('/sales', {
    customer: body.customerId || undefined,
    warehouse: body.warehouseId || undefined,
    discount: body.discountTotal || 0,
    taxPercent: body.items?.[0]?.taxRate ?? 0,
    items,
    payment: {
      method: body.paymentMethod,
      cash: body.paidCash,
      online: body.paidBank,
      receiptRef: body.transferReceiptUrl, // from the /uploads call
    },
  });
  return mapSale(res.data.sale);
}
async function realGatePassQr(id: string) {
  const res = await http.get(`/gate-passes/${id}/qr`, { responseType: 'blob' });
  return res.data as Blob;
}

/* ── Purchases (GP) ── */
function mapPurchaseItem(it: any) {
  return {
    productId: String(it.product?._id ?? it.product),
    name: it.name,
    product: { name: it.name }, // the print template reads item.product.name
    quantity: it.quantity,
    rate: it.unitCost,
    taxRate: it.taxPercent,
    discount: 0,
    amount: (it.lineTotal ?? 0) + (it.tax ?? 0),
  };
}
function mapPurchase(p: any, vendorName?: string) {
  return {
    id: String(p._id ?? p.id),
    gpNumber: p.number,
    vendorId: String(p.vendor?._id ?? p.vendor),
    warehouseId: String(p.warehouse?._id ?? p.warehouse),
    date: p.date,
    status: 'RECEIVED',
    subtotal: p.subtotal,
    taxTotal: p.tax,
    discountTotal: p.discount,
    grandTotal: p.total,
    paidAmount: p.paid,
    note: p.notes || undefined,
    items: (p.items ?? []).map(mapPurchaseItem),
    vendor: { name: vendorName ?? p.vendor?.name },
  };
}
async function realCreatePurchase(body: any) {
  // FE has per-line discounts; the backend takes one order-level discount and
  // allocates it across lines, so we pass the sum.
  const discount = (body.items ?? []).reduce(
    (s: number, l: any) => s + (Number(l.discount) || 0),
    0,
  );
  const items = (body.items ?? []).map((l: any) => ({
    product: l.productId,
    quantity: l.quantity,
    unitCost: l.rate,
    taxPercent: l.taxRate,
  }));
  const paid = body.paidAmount || 0;
  const res = await http.post('/purchases', {
    vendor: body.vendorId,
    warehouse: body.warehouseId || undefined,
    vendorInvoiceNo: body.invoiceNumber || undefined,
    date: body.date || undefined,
    discount,
    paid,
    // FE captures no payment method; default to cash when something is paid.
    paymentMethod: paid > 0 ? 'CASH' : undefined,
    items,
    notes: body.notes || undefined,
  });
  // The create response doesn't populate the vendor name (the print needs it).
  let vendorName: string | undefined;
  try {
    vendorName = (await http.get(`/vendors/${body.vendorId}`)).data.vendor?.name;
  } catch {
    vendorName = undefined;
  }
  return mapPurchase(res.data.purchase, vendorName);
}

/* ── Dashboard (one backend /dashboard call → three FE endpoints) ── */
async function realDashboard() {
  return (await http.get('/dashboard')).data; // { cards, salesTrend, topProducts }
}
async function realDashKpis() {
  const c = (await realDashboard()).cards;
  return {
    todaySales: c.todaySales ?? 0,
    monthSales: c.monthSales ?? 0,
    totalRevenue: c.totalRevenue ?? 0,
    totalExpenses: c.expenses ?? 0,
    stockValue: c.stockValue ?? 0,
    outstandingReceivables: c.receivables ?? 0,
    outstandingPayables: c.payables ?? 0,
  };
}
async function realDashTrend() {
  return (await realDashboard()).salesTrend ?? [];
}
async function realDashTop() {
  return ((await realDashboard()).topProducts ?? []).map((p: any) => ({
    productId: String(p.product ?? ''),
    name: p.name,
    quantity: p.quantity,
    revenue: p.revenue,
  }));
}

/* ── Reports (backend {rows,summary} → FE {title,columns,rows,summary}) ── */
async function realReport(type: string, params: any) {
  const beType = ({ stock: 'stock-valuation', pnl: 'profit-loss' } as any)[type] ?? type;
  const res = await http.get(`/reports/${beType}`, {
    params: { from: params.from, to: params.to },
  });
  const report = res.data.report;

  if (type === 'sales') {
    const rows = (report.rows as any[]).map((r) => ({
      saleNumber: r.number,
      date: dayKey(r.date),
      customer: r.customer,
      payment: r.paymentMethod,
      cash: r.cash,
      online: r.online,
      total: r.total,
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
        count: report.summary.count,
        cash: report.summary.cash,
        online: report.summary.online,
        total: report.summary.total,
      },
    };
  }
  if (type === 'purchases') {
    const rows = (report.rows as any[]).map((r) => ({
      gpNumber: r.number,
      date: dayKey(r.date),
      vendor: r.vendor,
      paid: r.paid,
      total: r.total,
    }));
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
      summary: {
        count: report.summary.count,
        paid: report.summary.paid,
        total: report.summary.total,
      },
    };
  }
  if (type === 'stock') {
    const rows = (report.rows as any[]).map((r) => ({
      name: r.product,
      sku: r.sku,
      qty: r.quantity,
      unit: r.unit,
      purchasePrice: r.avgCost,
      value: r.value,
      lowStock: '', // backend valuation rows carry no low-stock flag
    }));
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
      summary: {
        products: report.summary.count,
        totalQty: rows.reduce((s, r) => s + (r.qty || 0), 0),
        totalValue: report.summary.total,
      },
    };
  }
  // pnl
  const rev = report.revenue ?? 0;
  const cogs = report.costOfGoodsSold ?? 0;
  const gp = report.grossProfit ?? 0;
  const net = report.netProfit ?? 0;
  return {
    title: 'Profit & Loss',
    columns: [
      { key: 'item', label: 'Item' },
      { key: 'amount', label: 'Amount', numeric: true },
    ],
    rows: [
      { item: 'Revenue (Sales)', amount: rev },
      { item: 'Cost of Goods Sold', amount: -cogs },
      { item: 'Gross Profit', amount: gp },
      { item: 'Operating Expenses', amount: 0 },
      { item: 'Net Profit', amount: net },
    ],
    summary: { revenue: rev, cogs, grossProfit: gp, expenses: 0, netProfit: net },
  };
}

/* ── Cash book ── */
async function realCashLedger() {
  const stmt = (await http.get('/finance/cash-ledger')).data; // { opening, closing, rows }
  const rows = (stmt.rows as any[]).map((r, i) => ({
    id: String(i),
    date: r.date,
    type: (r.debit ?? 0) > 0 ? 'CASH_IN' : 'CASH_OUT',
    description: r.description || undefined,
    in: r.debit ?? 0, // CASH is debit-normal: money in = debit
    out: r.credit ?? 0,
    balanceAfter: r.balance ?? 0,
  }));
  rows.reverse(); // newest first (running balance already computed oldest→newest)
  return { balance: stmt.closing ?? 0, rows };
}
async function realCashEntry(body: any) {
  const res = await http.post('/finance/cash-entry', {
    direction: body.type === 'CASH_IN' ? 'IN' : 'OUT',
    amount: body.amount,
    note: body.description,
  });
  return res.data;
}

/* ── Bank accounts ── */
async function realBankAccounts() {
  const res = await http.get('/finance/bank-accounts');
  return (res.data.accounts as any[]).map((a) => ({
    id: String(a._id ?? a.id),
    name: a.name,
    bankName: a.bankName || undefined,
    balance: a.balance ?? 0,
  }));
}
async function realCreateBankAccount(body: any) {
  const res = await http.post('/finance/bank-accounts', {
    name: body.name,
    bankName: body.bankName,
  });
  const a = res.data.account;
  return { id: String(a._id ?? a.id), name: a.name, bankName: a.bankName || undefined, balance: 0 };
}

/* ── Invoices ── */
function mapInvoice(i: any) {
  // Backend already serializes to the FE field names (invoiceNumber, issueDate,
  // grandTotal, paidAmount, status, customer.name); we just pin a stable id.
  return {
    id: String(i._id ?? i.id),
    invoiceNumber: i.invoiceNumber,
    issueDate: i.issueDate,
    status: i.status,
    grandTotal: i.grandTotal,
    paidAmount: i.paidAmount,
    customer: i.customer ? { name: i.customer.name } : undefined,
  };
}
async function realInvoices() {
  const res = await http.get('/invoices', { params: { limit: 100 } });
  return (res.data.invoices as any[]).map(mapInvoice);
}
async function realCreateInvoice(body: any) {
  const res = await http.post('/invoices', { saleId: body.saleId });
  return mapInvoice(res.data.invoice);
}
async function realPayInvoice(id: string, body: any) {
  const res = await http.post(`/invoices/${id}/pay`, {
    amount: body.amount,
    method: body.method || undefined,
  });
  return mapInvoice(res.data.invoice);
}
async function realInvoicePdf(id: string) {
  const res = await http.get(`/invoices/${id}/pdf`, { responseType: 'blob' });
  return res.data as Blob;
}
async function realFetchInvoice(id: string) {
  return (await http.get(`/invoices/${id}`)).data.invoice;
}
// Email/WhatsApp have no backend endpoint; run them client-side off the real
// invoice so the buttons keep working against live data.
async function realSendInvoiceEmail(id: string) {
  const inv = await realFetchInvoice(id);
  const email = inv.customer?.email;
  return {
    sent: false,
    message: email
      ? `Email delivery isn't configured on the server yet (would send to ${email}).`
      : 'Customer has no email address.',
  };
}
async function realSendInvoiceWhatsapp(id: string) {
  const inv = await realFetchInvoice(id);
  const digits = String(inv.customer?.phone || '').replace(/[^0-9]/g, '');
  const text = encodeURIComponent(`Hello, here is your invoice ${inv.invoiceNumber}.`);
  return { url: `https://wa.me/${digits}?text=${text}`, hasPhone: digits.length > 0 };
}

/* ── Uploads (multipart receipt; field name `file`) ── */
async function realUpload(body: FormData) {
  // Let axios set the multipart boundary; the backend returns { url, name, size }.
  const res = await http.post('/uploads', body);
  return { url: res.data.url, name: res.data.name, size: res.data.size };
}

/* ── Settings (flat singleton; backend serializes the exact FE shape) ── */
async function realSettings() {
  return (await http.get('/settings')).data;
}
async function realUpdateSettings(body: any) {
  return (
    await http.put('/settings', {
      companyName: body.companyName,
      address: body.address,
      phone: body.phone,
      email: body.email,
      taxNumber: body.taxNumber,
      currency: body.currency,
    })
  ).data;
}

/* ── Roles (permission matrix on the Permissions screen) ── */
function mapRole(r: any) {
  return {
    id: String(r._id ?? r.id),
    name: r.name as string, // backend role names are lowercase (e.g. 'cashier')
    permissions: (r.permissions as string[]) ?? [],
  };
}
async function realRoles() {
  const res = await http.get('/roles');
  return (res.data.roles as any[]).map(mapRole);
}
async function realUpdateRole(id: string, body: any) {
  const res = await http.patch(`/roles/${id}`, { permissions: body.permissions });
  return mapRole(res.data.role);
}

/* ── Party ledger (customer/vendor statement) ── */
async function realPartyLedger(kindPlural: string, id: string) {
  const kind = kindPlural === 'customers' ? 'customer' : 'vendor';
  const stmt = (await http.get(`/finance/ledgers/${kind}/${id}`)).data; // { party, opening, closing, rows }
  return {
    balance: stmt.closing ?? 0,
    entries: (stmt.rows as any[]).map((r) => ({
      date: r.date,
      description: r.description || undefined,
      debit: r.debit ?? 0,
      credit: r.credit ?? 0,
      balanceAfter: r.balance ?? 0,
    })),
  };
}

/* ── Users (Permissions page) ── */
function mapManagedUser(u: any) {
  return {
    id: String(u._id ?? u.id),
    fullName: u.name,
    email: u.email,
    role: String(u.role).toUpperCase(), // backend lowercase → FE uppercase
    active: u.isActive !== false,
    createdAt: u.createdAt ? String(u.createdAt).slice(0, 10) : '',
  };
}
async function realUsers() {
  const res = await http.get('/users', { params: { limit: 100 } });
  return (res.data.users as any[]).map(mapManagedUser);
}
async function realCreateUser(body: any) {
  const res = await http.post('/users', {
    name: body.fullName,
    email: body.email,
    password: body.password,
    role: String(body.role).toLowerCase(),
  });
  return mapManagedUser(res.data.user);
}
async function realUpdateUser(id: string, body: any) {
  const res = await http.patch(`/users/${id}`, { name: body.fullName, email: body.email });
  return mapManagedUser(res.data.user);
}
async function realUpdateUserRole(id: string, body: any) {
  const res = await http.patch(`/users/${id}/role`, { role: String(body.role).toLowerCase() });
  return mapManagedUser(res.data.user);
}
async function realSetUserActive(id: string, body: any) {
  const res = await http.patch(`/users/${id}/active`, { isActive: body.active });
  return mapManagedUser(res.data.user);
}
async function realDeleteUser(id: string) {
  await http.delete(`/users/${id}`);
  return { success: true };
}

/**
 * Route a call to the real backend if its module is migrated; otherwise return
 * `undefined` so the caller falls back to the in-memory mock.
 */
async function tryReal(
  method: string,
  url: string,
  body: any,
  config?: ReqConfig,
): Promise<{ data: any } | undefined> {
  const seg = url.split('/').filter(Boolean);
  const params = config?.params ?? {};

  if (method === 'get') {
    if (url === '/warehouses') return wrap(await realWarehouses());
    if (url === '/products') return wrap(await realProductsList(params));
    if (url === '/catalog') return wrap(await realCatalog());
    if (url === '/categories') return wrap(await realCategories());
    if (url === '/units') return wrap(await realUnits());
    if (url === '/labour') return wrap(await realLabourList());
    if (url === '/customers') return wrap(await realCustomers(params));
    if (url === '/vendors') return wrap(await realVendors(params));
    if (url === '/sales') return wrap(await realSales());
    if (url === '/cash') return wrap(await realCashLedger());
    if (url === '/bank/accounts') return wrap(await realBankAccounts());
    if (url === '/users') return wrap(await realUsers());
    if (url === '/roles') return wrap(await realRoles());
    if (url === '/invoices') return wrap(await realInvoices());
    if (seg[0] === 'invoices' && seg[2] === 'pdf') return wrap(await realInvoicePdf(seg[1]));
    if (seg[0] === 'gate-passes' && seg[2] === 'qr') return wrap(await realGatePassQr(seg[1]));
    if (url === '/settings') return wrap(await realSettings());
    if (url === '/dashboard/kpis') return wrap(await realDashKpis());
    if (url === '/dashboard/sales-trend') return wrap(await realDashTrend());
    if (url === '/dashboard/top-products') return wrap(await realDashTop());
    if (seg[0] === 'reports' && seg[1]) return wrap(await realReport(seg[1], params));
    if ((seg[0] === 'customers' || seg[0] === 'vendors') && seg[2] === 'ledger')
      return wrap(await realPartyLedger(seg[0], seg[1]));
  }
  if (method === 'post') {
    if (url === '/warehouses') return wrap(await realCreateWarehouse(body));
    if (url === '/products') return wrap(await realCreateProduct(body));
    if (url === '/categories') return wrap(await realCreateCategory(body));
    if (url === '/units') return wrap(await realCreateUnit(body));
    if (url === '/labour') return wrap(await realCreateLabour(body));
    if (url === '/stock/adjust') return wrap(await realAdjustStock(body));
    if (url === '/customers') return wrap(await realCreateCustomer(body));
    if (url === '/vendors') return wrap(await realCreateVendor(body));
    if (url === '/sales') return wrap(await realCreateSale(body));
    if (url === '/purchases') return wrap(await realCreatePurchase(body));
    if (url === '/cash') return wrap(await realCashEntry(body));
    if (url === '/bank/accounts') return wrap(await realCreateBankAccount(body));
    if (url === '/users') return wrap(await realCreateUser(body));
    if (url === '/invoices') return wrap(await realCreateInvoice(body));
    if (seg[0] === 'invoices' && seg[2] === 'pay') return wrap(await realPayInvoice(seg[1], body));
    if (url === '/uploads') return wrap(await realUpload(body));
    if (seg[0] === 'invoices' && seg[2] === 'send-email')
      return wrap(await realSendInvoiceEmail(seg[1]));
    if (seg[0] === 'invoices' && seg[2] === 'send-whatsapp')
      return wrap(await realSendInvoiceWhatsapp(seg[1]));
    if (seg[0] === 'warehouses' && seg[2] === 'set-default')
      return wrap(await realSetDefaultWarehouse(seg[1]));
  }
  if (method === 'patch') {
    if (seg[0] === 'products' && seg[1]) return wrap(await realUpdateProduct(seg[1], body));
    if (seg[0] === 'vendors' && seg[1] && !seg[2])
      return wrap(await realUpdateVendor(seg[1], body));
    if (seg[0] === 'customers' && seg[1] && !seg[2])
      return wrap(await realUpdateCustomer(seg[1], body));
    if (seg[0] === 'warehouses' && seg[1] && !seg[2])
      return wrap(await realUpdateWarehouse(seg[1], body));
    if (seg[0] === 'categories' && seg[1]) return wrap(await realUpdateCategory(seg[1], body));
    if (seg[0] === 'units' && seg[1]) return wrap(await realUpdateUnit(seg[1], body));
    if (seg[0] === 'labour' && seg[1]) return wrap(await realUpdateLabour(seg[1], body));
    if (seg[0] === 'users' && seg[1] && !seg[2]) return wrap(await realUpdateUser(seg[1], body));
    if (seg[0] === 'users' && seg[2] === 'role')
      return wrap(await realUpdateUserRole(seg[1], body));
    if (seg[0] === 'users' && seg[2] === 'active')
      return wrap(await realSetUserActive(seg[1], body));
    if (seg[0] === 'roles' && seg[1] && !seg[2]) return wrap(await realUpdateRole(seg[1], body));
  }
  if (method === 'put') {
    if (url === '/settings') return wrap(await realUpdateSettings(body));
  }
  if (method === 'delete') {
    if (seg[0] === 'users' && seg[1] && !seg[2]) return wrap(await realDeleteUser(seg[1]));
    if (seg[0] === 'vendors' && seg[1] && !seg[2]) return wrap(await realDeleteVendor(seg[1]));
    if (seg[0] === 'customers' && seg[1] && !seg[2]) return wrap(await realDeleteCustomer(seg[1]));
    if (seg[0] === 'warehouses' && seg[1] && !seg[2])
      return wrap(await realDeleteWarehouse(seg[1]));
    if (seg[0] === 'categories' && seg[1]) return wrap(await realDeleteCategory(seg[1]));
    if (seg[0] === 'units' && seg[1]) return wrap(await realDeleteUnit(seg[1]));
    if (seg[0] === 'labour' && seg[1]) return wrap(await realDeleteLabour(seg[1]));
  }
  return undefined;
}

async function dispatch(method: string, url: string, body?: any, config?: ReqConfig) {
  const real = await tryReal(method, url, body, config);
  if (real !== undefined) return real;
  return handle(method, url, body, config);
}

/* axios-compatible surface used across the app */
export const api = {
  get: (url: string, config?: ReqConfig) => dispatch('get', url, undefined, config),
  post: (url: string, body?: any, config?: ReqConfig) => dispatch('post', url, body, config),
  patch: (url: string, body?: any, config?: ReqConfig) => dispatch('patch', url, body, config),
  put: (url: string, body?: any, config?: ReqConfig) => dispatch('put', url, body, config),
  delete: (url: string, config?: ReqConfig) => dispatch('delete', url, undefined, config),
};
