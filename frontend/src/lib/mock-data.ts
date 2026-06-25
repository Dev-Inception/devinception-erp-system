/**
 * In-memory mock dataset + domain helpers that stand in for the backend API.
 *
 * There is NO network here — `lib/api.ts` routes calls to the helpers below and
 * mutations update this in-memory store, so the UI behaves like a live app
 * (create a customer → it appears in lists, ring up a sale → stock drops, etc.).
 * Reloading the page resets everything to the seed data.
 */

/* ─────────────────────────── types ─────────────────────────── */
export interface Warehouse {
  id: string;
  name: string;
  location?: string;
  isDefault: boolean;
}
export interface Category {
  id: string;
  name: string;
}
export interface Brand {
  id: string;
  name: string;
}
export interface Unit {
  id: string;
  name: string;
  abbreviation: string;
}
export interface Product {
  id: string;
  name: string;
  sku: string;
  barcode?: string;
  description?: string;
  categoryId?: string;
  brandId?: string;
  unitId?: string;
  purchasePrice: number;
  salePrice: number;
  taxRate: number;
  minStock: number;
  isActive: boolean;
}
export interface Customer {
  id: string;
  name: string;
  phone?: string;
  email?: string;
  address?: string;
  creditLimit: number;
  openingBalance: number;
}
export interface Vendor {
  id: string;
  name: string;
  phone?: string;
  email?: string;
  address?: string;
  ntn?: string;
  openingBalance: number;
}
export interface SaleItem {
  productId: string;
  name: string;
  quantity: number;
  unitPrice: number;
  discount: number;
  taxRate: number;
  amount: number;
}
export interface Sale {
  id: string;
  saleNumber: string;
  customerId?: string;
  warehouseId: string;
  date: string;
  status: string;
  subtotal: number;
  discountTotal: number;
  taxTotal: number;
  grandTotal: number;
  paymentMethod: string;
  paidCash: number;
  paidCard: number;
  paidBank: number;
  changeDue: number;
  items: SaleItem[];
}
export interface PurchaseItem {
  productId: string;
  name: string;
  quantity: number;
  rate: number;
  taxRate: number;
  discount: number;
  amount: number;
}
export interface Purchase {
  id: string;
  gpNumber: string;
  vendorId: string;
  warehouseId: string;
  invoiceNumber?: string;
  date: string;
  status: string;
  subtotal: number;
  taxTotal: number;
  discountTotal: number;
  grandTotal: number;
  paidAmount: number;
  note?: string;
  items: PurchaseItem[];
}
export interface Invoice {
  id: string;
  invoiceNumber: string;
  saleId?: string;
  customerId: string;
  status: string;
  issueDate: string;
  subtotal: number;
  taxTotal: number;
  discountTotal: number;
  grandTotal: number;
  paidAmount: number;
}
export interface CashTxn {
  id: string;
  type: 'CASH_IN' | 'CASH_OUT';
  amount: number;
  description?: string;
  date: string;
}
export interface BankAccount {
  id: string;
  name: string;
  bankName?: string;
  accountNumber?: string;
  balance: number;
}
export interface LedgerEntry {
  accountKind: 'customers' | 'vendors';
  accountId: string;
  date: string;
  description?: string;
  debit: number;
  credit: number;
}
export interface Settings {
  companyName: string;
  address?: string;
  phone?: string;
  email?: string;
  taxNumber?: string;
  currency: string;
}

/* ─────────────────────────── helpers ─────────────────────────── */
let counter = 1000;
export const uid = (prefix = 'id') => `${prefix}_${(counter++).toString(36)}${Math.random().toString(36).slice(2, 6)}`;

const daysAgo = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString();
};

/* ─────────────────────────── seed data ─────────────────────────── */
export const db = {
  warehouses: [
    { id: 'w1', name: 'Main Store', location: 'HQ — Lahore', isDefault: true },
    { id: 'w2', name: 'Downtown Branch', location: 'Mall Road', isDefault: false },
  ] as Warehouse[],

  categories: [
    { id: 'c1', name: 'Electronics' },
    { id: 'c2', name: 'Accessories' },
    { id: 'c3', name: 'Office Supplies' },
  ] as Category[],

  brands: [
    { id: 'b1', name: 'Logitech' },
    { id: 'b2', name: 'Keychron' },
    { id: 'b3', name: 'Generic' },
  ] as Brand[],

  units: [
    { id: 'u1', name: 'Piece', abbreviation: 'pc' },
    { id: 'u2', name: 'Box', abbreviation: 'box' },
  ] as Unit[],

  products: [
    { id: 'p1', name: 'Wireless Mouse', sku: 'WM-001', barcode: '8901001000017', categoryId: 'c2', brandId: 'b1', unitId: 'u1', purchasePrice: 800, salePrice: 1200, taxRate: 0, minStock: 10, isActive: true },
    { id: 'p2', name: 'USB-C Cable 1m', sku: 'UC-002', barcode: '8901001000024', categoryId: 'c2', brandId: 'b3', unitId: 'u1', purchasePrice: 150, salePrice: 350, taxRate: 0, minStock: 25, isActive: true },
    { id: 'p3', name: 'Mechanical Keyboard', sku: 'MK-003', barcode: '8901001000031', categoryId: 'c1', brandId: 'b2', unitId: 'u1', purchasePrice: 4500, salePrice: 6500, taxRate: 0, minStock: 5, isActive: true },
    { id: 'p4', name: '27" 4K Monitor', sku: 'MN-004', barcode: '8901001000048', categoryId: 'c1', brandId: 'b3', unitId: 'u1', purchasePrice: 38000, salePrice: 47500, taxRate: 0, minStock: 3, isActive: true },
    { id: 'p5', name: 'Laptop Stand', sku: 'LS-005', barcode: '8901001000055', categoryId: 'c2', brandId: 'b3', unitId: 'u1', purchasePrice: 1200, salePrice: 2200, taxRate: 0, minStock: 8, isActive: true },
    { id: 'p6', name: 'A4 Paper Ream', sku: 'PP-006', barcode: '8901001000062', categoryId: 'c3', brandId: 'b3', unitId: 'u2', purchasePrice: 700, salePrice: 1050, taxRate: 0, minStock: 20, isActive: true },
    { id: 'p7', name: 'Webcam 1080p', sku: 'WC-007', barcode: '8901001000079', categoryId: 'c1', brandId: 'b1', unitId: 'u1', purchasePrice: 3200, salePrice: 4800, taxRate: 0, minStock: 6, isActive: true },
    { id: 'p8', name: 'Desk Organizer', sku: 'DO-008', barcode: '8901001000086', categoryId: 'c3', brandId: 'b3', unitId: 'u1', purchasePrice: 600, salePrice: 1100, taxRate: 0, minStock: 12, isActive: true },
  ] as Product[],

  // stock[productId][warehouseId] = quantity on hand
  stock: {
    p1: { w1: 42, w2: 12 },
    p2: { w1: 180, w2: 60 },
    p3: { w1: 9, w2: 4 },
    p4: { w1: 5, w2: 1 },
    p5: { w1: 24, w2: 6 },
    p6: { w1: 8, w2: 0 },
    p7: { w1: 14, w2: 3 },
    p8: { w1: 30, w2: 10 },
  } as Record<string, Record<string, number>>,

  customers: [
    { id: 'walk-in', name: 'Walk-in Customer', creditLimit: 0, openingBalance: 0 },
    { id: 'cust1', name: 'Ahmed Traders', phone: '+92 300 1112233', email: 'ahmed@traders.pk', address: 'Gulberg, Lahore', creditLimit: 100000, openingBalance: 18500 },
    { id: 'cust2', name: 'Bright Office Solutions', phone: '+92 321 4455667', email: 'info@brightoffice.pk', address: 'DHA Phase 5', creditLimit: 250000, openingBalance: 0 },
    { id: 'cust3', name: 'Zain Electronics', phone: '+92 333 9988776', email: 'zain@ze.pk', address: 'Hall Road', creditLimit: 50000, openingBalance: 7200 },
    { id: 'cust4', name: 'Crescent Mart', phone: '+92 301 2223344', email: 'buy@crescentmart.pk', address: 'Johar Town', creditLimit: 150000, openingBalance: 0 },
  ] as Customer[],

  vendors: [
    { id: 'ven1', name: 'Acme Distributors', phone: '+92 42 35001122', email: 'sales@acme.pk', address: 'Industrial Estate', ntn: '1234567-8', openingBalance: 64000 },
    { id: 'ven2', name: 'TechSource Imports', phone: '+92 42 35778899', email: 'orders@techsource.pk', address: 'Shahdara', ntn: '7654321-0', openingBalance: 0 },
    { id: 'ven3', name: 'Paper & Co.', phone: '+92 42 35443322', email: 'hello@paperco.pk', address: 'Badami Bagh', ntn: '5556667-1', openingBalance: 12500 },
    { id: 'ven4', name: 'Global Peripherals', phone: '+92 42 35112299', email: 'gp@global.pk', address: 'Township', openingBalance: 0 },
  ] as Vendor[],

  sales: [] as Sale[],
  purchases: [] as Purchase[],
  invoices: [] as Invoice[],
  cashTxns: [] as CashTxn[],
  bankAccounts: [
    { id: 'bank1', name: 'Operating Account', bankName: 'HBL', accountNumber: '0001-23456789', balance: 845000 },
    { id: 'bank2', name: 'Payroll Account', bankName: 'Meezan', accountNumber: '0002-98765432', balance: 220000 },
  ] as BankAccount[],
  ledger: [] as LedgerEntry[],

  settings: {
    companyName: 'DevInception Retail',
    address: '123 Market Road, Lahore',
    phone: '+92 300 1234567',
    email: 'sales@devinception.com',
    taxNumber: '1234567-8',
    currency: 'PKR',
  } as Settings,

  seq: { SALE: 1, GP: 1, INV: 1 },
};

/* ─── seed some historical sales, purchases, invoices & cash ─── */
function seedHistory() {
  const pick = (id: string) => db.products.find((p) => p.id === id)!;
  const saleSpecs: Array<{ day: number; customerId?: string; method: string; lines: [string, number][] }> = [
    { day: 1, customerId: undefined, method: 'CASH', lines: [['p1', 2], ['p2', 3]] },
    { day: 2, customerId: 'cust1', method: 'BANK_TRANSFER', lines: [['p3', 1], ['p5', 2]] },
    { day: 3, customerId: undefined, method: 'CASH', lines: [['p2', 5]] },
    { day: 5, customerId: 'cust4', method: 'MIXED', lines: [['p4', 1], ['p7', 2]] },
    { day: 7, customerId: undefined, method: 'CASH', lines: [['p8', 4], ['p6', 2]] },
    { day: 9, customerId: 'cust3', method: 'CASH', lines: [['p1', 1], ['p5', 1], ['p2', 2]] },
    { day: 12, customerId: undefined, method: 'BANK_TRANSFER', lines: [['p7', 1]] },
    { day: 15, customerId: 'cust2', method: 'CASH', lines: [['p3', 2]] },
    { day: 18, customerId: undefined, method: 'CASH', lines: [['p6', 3], ['p8', 2]] },
    { day: 22, customerId: 'cust1', method: 'MIXED', lines: [['p4', 1]] },
    { day: 26, customerId: undefined, method: 'CASH', lines: [['p1', 3], ['p2', 4]] },
    { day: 0, customerId: undefined, method: 'CASH', lines: [['p5', 1], ['p2', 2]] },
  ];

  for (const spec of saleSpecs) {
    const items: SaleItem[] = spec.lines.map(([pid, qty]) => {
      const p = pick(pid);
      const amount = p.salePrice * qty;
      return { productId: pid, name: p.name, quantity: qty, unitPrice: p.salePrice, discount: 0, taxRate: 0, amount };
    });
    const subtotal = items.reduce((s, i) => s + i.amount, 0);
    const grandTotal = subtotal;
    const isCash = spec.method === 'CASH';
    const isBank = spec.method === 'BANK_TRANSFER';
    const sale: Sale = {
      id: uid('sale'),
      saleNumber: `SALE-2026-${String(db.seq.SALE++).padStart(6, '0')}`,
      customerId: spec.customerId,
      warehouseId: 'w1',
      date: daysAgo(spec.day),
      status: 'COMPLETED',
      subtotal,
      discountTotal: 0,
      taxTotal: 0,
      grandTotal,
      paymentMethod: spec.method,
      paidCash: isCash ? grandTotal : spec.method === 'MIXED' ? Math.round(grandTotal / 2) : 0,
      paidCard: 0,
      paidBank: isBank ? grandTotal : spec.method === 'MIXED' ? grandTotal - Math.round(grandTotal / 2) : 0,
      changeDue: 0,
      items,
    };
    db.sales.push(sale);
    if (sale.paidCash > 0) {
      db.cashTxns.push({ id: uid('cash'), type: 'CASH_IN', amount: sale.paidCash, description: `POS sale ${sale.saleNumber}`, date: sale.date });
    }
    // reduce stock for seeded sales
    for (const it of items) {
      db.stock[it.productId] = db.stock[it.productId] || {};
      db.stock[it.productId].w1 = (db.stock[it.productId].w1 ?? 0) - it.quantity;
    }
  }

  // a few operating expenses (cash out)
  db.cashTxns.push({ id: uid('cash'), type: 'CASH_OUT', amount: 12000, description: 'Shop rent', date: daysAgo(10) });
  db.cashTxns.push({ id: uid('cash'), type: 'CASH_OUT', amount: 4500, description: 'Utility bills', date: daysAgo(6) });
  db.cashTxns.push({ id: uid('cash'), type: 'CASH_OUT', amount: 8000, description: 'Staff advance', date: daysAgo(3) });

  // a couple of purchases
  const gpSpecs: Array<{ day: number; vendorId: string; lines: [string, number, number][]; paid: number }> = [
    { day: 14, vendorId: 'ven1', lines: [['p1', 30, 800], ['p2', 100, 150]], paid: 30000 },
    { day: 8, vendorId: 'ven2', lines: [['p3', 10, 4500], ['p7', 8, 3200]], paid: 70000 },
  ];
  for (const spec of gpSpecs) {
    const items: PurchaseItem[] = spec.lines.map(([pid, qty, rate]) => ({
      productId: pid,
      name: pick(pid).name,
      quantity: qty,
      rate,
      taxRate: 0,
      discount: 0,
      amount: qty * rate,
    }));
    const subtotal = items.reduce((s, i) => s + i.amount, 0);
    db.purchases.push({
      id: uid('gp'),
      gpNumber: `GP-2026-${String(db.seq.GP++).padStart(4, '0')}`,
      vendorId: spec.vendorId,
      warehouseId: 'w1',
      invoiceNumber: `VINV-${spec.vendorId.toUpperCase()}-${spec.day}`,
      date: daysAgo(spec.day),
      status: 'RECEIVED',
      subtotal,
      taxTotal: 0,
      discountTotal: 0,
      grandTotal: subtotal,
      paidAmount: spec.paid,
      items,
    });
  }

  // invoices from the first two customer sales
  db.sales
    .filter((s) => s.customerId)
    .slice(0, 2)
    .forEach((s) => {
      const paid = s.paidCash + s.paidCard + s.paidBank;
      db.invoices.push({
        id: uid('inv'),
        invoiceNumber: `INV-2026-${String(db.seq.INV++).padStart(6, '0')}`,
        saleId: s.id,
        customerId: s.customerId!,
        status: paid >= s.grandTotal ? 'PAID' : 'ISSUED',
        issueDate: s.date,
        subtotal: s.subtotal,
        taxTotal: s.taxTotal,
        discountTotal: s.discountTotal,
        grandTotal: s.grandTotal,
        paidAmount: paid,
      });
    });

  // ledger entries for parties carrying a balance
  db.ledger.push(
    { accountKind: 'customers', accountId: 'cust1', date: daysAgo(20), description: 'Opening balance', debit: 18500, credit: 0 },
    { accountKind: 'customers', accountId: 'cust3', date: daysAgo(16), description: 'Opening balance', debit: 7200, credit: 0 },
    { accountKind: 'vendors', accountId: 'ven1', date: daysAgo(18), description: 'Opening balance', debit: 0, credit: 64000 },
    { accountKind: 'vendors', accountId: 'ven3', date: daysAgo(15), description: 'Opening balance', debit: 0, credit: 12500 },
  );
}
seedHistory();

/* ─────────────────────────── computed views ─────────────────────────── */
export const findProduct = (id: string) => db.products.find((p) => p.id === id);

export function productStock(productId: string, warehouseId?: string): number {
  const byWh = db.stock[productId] || {};
  if (warehouseId) return byWh[warehouseId] ?? 0;
  return Object.values(byWh).reduce((s, q) => s + q, 0);
}

export function partyOutstanding(kind: 'customers' | 'vendors', id: string): number {
  const entries = db.ledger.filter((e) => e.accountKind === kind && e.accountId === id);
  if (entries.length === 0) {
    const list = kind === 'customers' ? db.customers : db.vendors;
    return list.find((p) => p.id === id)?.openingBalance ?? 0;
  }
  return entries.reduce((s, e) => s + (kind === 'customers' ? e.debit - e.credit : e.credit - e.debit), 0);
}
