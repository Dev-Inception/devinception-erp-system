const { Op } = require('sequelize');
const { initializeModels } = require('../db/models');
const ApiError = require('../utils/ApiError');
const { ACCOUNT, REF } = require('../utils/finance');
const journalService = require('./journalService');
const stockService = require('./stockService');
const { parseReportDate, formatReportDate } = require('../utils/reportDate');
const { normalizeQuantity } = require('../utils/quantity');
const {
  resolveWarehouseScope,
  warehouseWhere,
  resolveStoreScope,
  assertStoreAccess,
} = require('../utils/storeScope');

/**
 * Reporting: date-range aggregations over transactional data and the ledger.
 * All money is paisa; controllers convert it to currency units. Each report
 * returns presentation-ready columns, detailed rows, summaries, and metadata.
 */

// The widest period a transactional report may span. Without an upper bound a
// single request could still pull years of rows into memory.
const MAX_RANGE_DAYS = 366;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Validate and normalize a required reporting window. Both ends are mandatory
 * for the row-level reports (sales/purchases) so we never load the entire
 * table, and the span is capped to keep result sets bounded.
 */
function normalizeRange({ from, to }, required = true) {
  if (!from || !to) {
    if (!required && !from && !to) return null;
    throw ApiError.badRequest("Both 'from' and 'to' dates are required for this report");
  }
  const start = parseReportDate(from, 'from');
  const end = parseReportDate(to, 'to', { endOfDay: true });
  if (start > end) {
    throw ApiError.badRequest("'from' must be on or before 'to'");
  }
  // Because `end` is 23:59:59.999, a 366-calendar-day window is just under
  // 366 full days, while a 367-calendar-day window is just under 367 days.
  if (end - start >= MAX_RANGE_DAYS * MS_PER_DAY) {
    throw ApiError.badRequest(`Date range cannot exceed ${MAX_RANGE_DAYS} days`);
  }
  return { from: start, to: end };
}

function requireRange(params) {
  const range = normalizeRange(params);
  return { date: { [Op.gte]: range.from, [Op.lte]: range.to } };
}

function warehouseInfo(warehouse) {
  if (!warehouse) return null;
  return {
    id: String(warehouse.id),
    name: warehouse.name,
    location: warehouse.location || '',
    address: warehouse.address || '',
    isDefault: !!warehouse.isDefault,
  };
}

// Sales report: Sale is the sole sales source.
async function salesReport({ from, to, warehouseIds, store }) {
  const { Sale, SaleItem, Customer, Warehouse } = initializeModels();
  const where = requireRange({ from, to });
  // Every sale records its own storefront directly — prefer that over the
  // looser warehouse-membership scoping (two stores can share a warehouse).
  if (store) {
    where.store = store;
  } else {
    Object.assign(where, warehouseWhere(warehouseIds));
  }
  const sales = await Sale.findAll({
    where,
    include: [
      {
        model: Customer,
        as: 'customerInfo',
        attributes: ['id', 'name', 'phone', 'email', 'address'],
      },
      {
        model: Warehouse,
        as: 'warehouseInfo',
        attributes: ['id', 'name', 'location', 'address', 'isDefault'],
      },
      { model: SaleItem, as: 'items', separate: true, attributes: ['quantity'] },
    ],
    order: [
      ['date', 'DESC'],
      ['createdAt', 'DESC'],
    ],
  });

  const rows = sales.map((s) => {
    const wh = warehouseInfo(s.warehouseInfo);
    const customer = s.customerInfo;
    return {
      id: String(s.id),
      documentType: 'SALE',
      number: s.number,
      date: s.date,
      customerId: customer ? String(customer.id) : s.customer ? String(s.customer) : null,
      customer: s.customerName,
      customerDetails: customer
        ? {
            id: String(customer.id),
            name: customer.name || s.customerName,
            phone: customer.phone || '',
            email: customer.email || '',
            address: customer.address || '',
          }
        : null,
      customerPhone: customer ? customer.phone || '' : '',
      customerEmail: customer ? customer.email || '' : '',
      customerAddress: customer ? customer.address || '' : '',
      warehouse: wh ? wh.name : '—',
      warehouseLocation: wh ? wh.location : '',
      warehouseAddress: wh ? wh.address : '',
      warehouseIsDefault: wh ? wh.isDefault : false,
      warehouseDetails: wh,
      itemCount: s.items.length,
      quantity: normalizeQuantity(s.items.reduce((sum, item) => sum + item.quantity, 0)),
      subtotal: s.subtotal,
      discount: s.discount,
      tax: s.tax,
      taxableAmount: s.subtotal - s.discount,
      taxPercent: s.taxPercent || 0,
      paymentMethod: s.paymentMethod,
      cash: s.cashAmount,
      online: s.onlineAmount,
      credit: s.creditAmount,
      paid: (s.cashAmount || 0) + (s.onlineAmount || 0),
      balance: s.creditAmount || 0,
      total: s.total,
    };
  });

  const summary = rows.reduce(
    (acc, r) => {
      acc.count += 1;
      acc.itemCount += r.itemCount;
      acc.quantity = normalizeQuantity(acc.quantity + r.quantity);
      acc.subtotal += r.subtotal;
      acc.discount += r.discount;
      acc.taxableAmount += r.taxableAmount;
      acc.tax += r.tax;
      acc.cash += r.cash;
      acc.online += r.online;
      acc.credit += r.credit;
      acc.paid += r.paid;
      acc.balance += r.balance;
      acc.total += r.total;
      return acc;
    },
    {
      count: 0,
      itemCount: 0,
      quantity: 0,
      subtotal: 0,
      discount: 0,
      taxableAmount: 0,
      tax: 0,
      cash: 0,
      online: 0,
      credit: 0,
      paid: 0,
      balance: 0,
      total: 0,
    },
  );

  return {
    title: 'Sales Report',
    columns: [
      { key: 'number', label: 'Sale #' },
      { key: 'documentType', label: 'Type' },
      { key: 'date', label: 'Date' },
      { key: 'warehouse', label: 'Warehouse' },
      { key: 'customer', label: 'Customer' },
      { key: 'paymentMethod', label: 'Payment' },
      { key: 'subtotal', label: 'Subtotal', numeric: true },
      { key: 'discount', label: 'Discount', numeric: true },
      { key: 'taxableAmount', label: 'Taxable Amount', numeric: true },
      { key: 'taxPercent', label: 'Tax Rate (%)', numeric: true },
      { key: 'tax', label: 'Tax', numeric: true },
      { key: 'paid', label: 'Paid', numeric: true },
      { key: 'balance', label: 'Balance', numeric: true },
      { key: 'total', label: 'Total', numeric: true },
    ],
    rows,
    summary,
  };
}

// Stock valuation: quantity × moving-average cost per product.
async function stockValuationReport({ warehouseIds }) {
  const { rows, total } = await stockService.valuation({ warehouseIds });
  const detailRows = rows.map((r) => ({
    productId: String(r.product.id),
    product: r.product.name,
    sku: r.product.sku || '',
    unit: r.product.unitInfo ? r.product.unitInfo.abbreviation || r.product.unitInfo.name : '',
    warehouse: r.warehouse ? r.warehouse.name : '',
    warehouseLocation: r.warehouse ? r.warehouse.location || '' : '',
    warehouseAddress: r.warehouse ? r.warehouse.address || '' : '',
    warehouseIsDefault: r.warehouse ? !!r.warehouse.isDefault : false,
    warehouseDetails: warehouseInfo(r.warehouse),
    quantity: normalizeQuantity(r.quantity),
    minStock: r.product.minStock || 0,
    lowStock: normalizeQuantity(r.quantity) <= (r.product.minStock || 0),
    avgCost: r.avgCost,
    value: r.value,
  }));
  return {
    rows: detailRows,
    title: 'Stock Valuation',
    columns: [
      { key: 'product', label: 'Product' },
      { key: 'sku', label: 'SKU' },
      { key: 'warehouse', label: 'Warehouse' },
      { key: 'quantity', label: 'Qty', numeric: true },
      { key: 'unit', label: 'Unit' },
      { key: 'avgCost', label: 'Average Cost', numeric: true },
      { key: 'value', label: 'Stock Value', numeric: true },
      { key: 'lowStock', label: 'Low Stock' },
    ],
    summary: {
      count: detailRows.length,
      productCount: new Set(detailRows.map((row) => row.productId)).size,
      quantity: normalizeQuantity(detailRows.reduce((sum, row) => sum + row.quantity, 0)),
      lowStockCount: detailRows.filter((row) => row.lowStock).length,
      total,
    },
  };
}

/**
 * Profit & Loss for a period, derived from the ledger:
 *   Revenue (net Sales) − COGS = Gross profit
 *   Gross profit − operating expenses = Net profit.
 */
async function profitAndLossReport({ from, to, warehouseIds, store }) {
  const { Sale } = initializeModels();
  const normalized = normalizeRange({ from, to }, false);
  const range = normalized ? { ...normalized } : {};
  const expenseRange = normalized ? { ...normalized } : {};
  if (store) {
    // Every sale and expense records its own storefront directly — prefer
    // that over the looser warehouse-membership scoping.
    const sourceWhere = { store };
    if (normalized) sourceWhere.date = { [Op.gte]: normalized.from, [Op.lte]: normalized.to };
    const sales = await Sale.findAll({ where: sourceWhere, attributes: ['id'] });
    range.refType = REF.SALE;
    range.refIds = sales.map((s) => s.id);
    expenseRange.store = store;
  } else if (warehouseIds) {
    const sourceWhere = { ...warehouseWhere(warehouseIds) };
    if (normalized) sourceWhere.date = { [Op.gte]: normalized.from, [Op.lte]: normalized.to };
    const sales = await Sale.findAll({ where: sourceWhere, attributes: ['id'] });
    range.refType = REF.SALE;
    range.refIds = sales.map((s) => s.id);
    // journalService.accountTotals's `warehouse` option accepts either a
    // scalar id or an array (see its Array.isArray branch) — pass the
    // resolved id list directly rather than a Sequelize `where` fragment.
    expenseRange.warehouse = warehouseIds;
  }
  const [sales, cogs, expenses] = await Promise.all([
    journalService.accountTotals(ACCOUNT.SALES, null, range),
    journalService.accountTotals(ACCOUNT.COGS, null, range),
    journalService.accountTotals(ACCOUNT.OPERATING_EXPENSE, null, expenseRange),
  ]);

  const revenue = sales.credit - sales.debit; // income is credit-normal
  const costOfGoodsSold = cogs.debit - cogs.credit; // expense is debit-normal
  const grossProfit = revenue - costOfGoodsSold;
  const operatingExpenses = expenses.debit - expenses.credit;
  const netProfit = grossProfit - operatingExpenses;

  return {
    title: 'Profit & Loss',
    columns: [
      { key: 'item', label: 'Item' },
      { key: 'amount', label: 'Amount', numeric: true },
    ],
    rows: [
      { key: 'revenue', item: 'Revenue (Sales)', amount: revenue },
      { key: 'cogs', item: 'Cost of Goods Sold', amount: -costOfGoodsSold },
      { key: 'grossProfit', item: 'Gross Profit', amount: grossProfit },
      { key: 'expenses', item: 'Operating Expenses', amount: -operatingExpenses },
      { key: 'netProfit', item: 'Net Profit', amount: netProfit },
    ],
    summary: {
      revenue,
      cogs: costOfGoodsSold,
      grossProfit,
      expenses: operatingExpenses,
      netProfit,
    },
    revenue,
    costOfGoodsSold,
    grossProfit,
    operatingExpenses,
    netProfit,
  };
}

// Human-readable labels for the source-document types that post journal
// entries — used to label each Day Book row.
const VOUCHER_LABELS = {
  [REF.SALE]: 'Sale',
  [REF.SALE_RETURN]: 'Sale Return',
  [REF.PURCHASE]: 'Stock Purchase',
  [REF.PAYMENT]: 'Vendor Payment',
  [REF.RECEIPT]: 'Customer Receipt',
  [REF.CASH_ADJUST]: 'Cash Adjustment',
  [REF.EXPENSE]: 'Expense',
  [REF.OPENING]: 'Opening Balance',
};

// Defaults to today (in the reporting timezone) when no range is given, and
// mirrors a single date across both ends when only one is given — Day Book is
// normally viewed one day at a time.
function resolveDayRange({ from, to }) {
  const today = formatReportDate(new Date());
  return normalizeRange({ from: from || to || today, to: to || from || today });
}

// Sum whichever side (debit or credit) of each line matches `predicate`,
// across every entry — the shared building block for every Day Book total.
function sumWhere(entries, predicate) {
  let total = 0;
  for (const entry of entries) {
    for (const line of entry.lines) {
      if (predicate(line, entry)) total += line.debit || line.credit || 0;
    }
  }
  return total;
}

// True when an entry actually moved cash or bank funds, as opposed to
// merely booking a payable (e.g. Dr Expense / Cr AP_TRANSPORT for a
// transporter fare owed but not yet paid). Day Book is a same-day
// cash/bank activity register, not the accrual ledger — pending vendor,
// transporter, supplier, and labour liabilities belong to their own
// account statements, not here.
function isSettledInCashOrBank(entry) {
  return entry.lines.some((l) => l.account === ACCOUNT.CASH || l.account === ACCOUNT.BANK);
}

/**
 * Day Book: a chronological register of every journal entry (voucher) posted
 * on the day(s) in range — sales, stock receipts, vendor payments, customer
 * receipts, cash adjustments, and operating expenses — so the day's full
 * financial activity can be reviewed in one place, headlined by the day's
 * total operating expenses.
 */
async function dayBookReport({ from, to, warehouseIds, store }) {
  const { JournalEntry, JournalLine, Warehouse, BankAccount } = initializeModels();
  const range = resolveDayRange({ from, to });
  const where = { date: { [Op.gte]: range.from, [Op.lte]: range.to } };
  if (store) {
    // Sales, purchases, payments, receipts, cash adjustments, and expenses
    // all record their own storefront directly. A handful of entry types
    // (manual stock adjustments, legacy data) carry no store at all — always
    // include those rather than making them disappear from every store's day.
    where[Op.or] = [{ store: null }, { store }];
  } else if (warehouseIds) {
    // Business-wide entries (vendor payments, customer receipts, cash
    // adjustments) carry no warehouse at all — always include them rather
    // than making them disappear from every specific store's day.
    where[Op.or] = [{ warehouse: null }, { warehouse: { [Op.in]: warehouseIds } }];
  }
  const entries = await JournalEntry.findAll({
    where,
    include: [
      { model: JournalLine, as: 'lines', separate: true },
      { model: Warehouse, as: 'warehouseInfo', attributes: ['id', 'name'] },
    ],
    order: [
      ['date', 'ASC'],
      ['createdAt', 'ASC'],
    ],
  });

  const rows = entries.map((e) => ({
    id: String(e.id),
    date: e.date,
    voucherType: e.refType,
    voucherLabel: VOUCHER_LABELS[e.refType] || e.refType,
    voucherNo: e.refNo || '',
    description: e.description || VOUCHER_LABELS[e.refType] || e.refType,
    warehouse: e.warehouseInfo ? e.warehouseInfo.name : '',
    amount: e.lines.reduce((sum, l) => sum + (l.debit || 0), 0),
  }));

  const summary = {
    transactionCount: entries.length,
    totalSales: sumWhere(entries, (l) => l.account === ACCOUNT.SALES && l.credit > 0),
    totalCOGS: sumWhere(entries, (l) => l.account === ACCOUNT.COGS && l.debit > 0),
    totalPurchases: sumWhere(
      entries,
      (l, e) => e.refType === REF.PURCHASE && l.account === ACCOUNT.INVENTORY && l.debit > 0,
    ),
    // Only expenses actually paid out in cash/bank on this day — an expense
    // booked as owed to a transporter/labourer/supplier (Cr AP_*) sits in
    // the accrual ledger until it's settled, so it shouldn't inflate the
    // Day Book's expense total.
    totalExpenses: sumWhere(
      entries,
      (l, e) => l.account === ACCOUNT.OPERATING_EXPENSE && l.debit > 0 && isSettledInCashOrBank(e),
    ),
    totalVendorPayments: sumWhere(entries, (l) => l.account === ACCOUNT.AP && l.debit > 0),
    totalCustomerReceipts: sumWhere(entries, (l) => l.account === ACCOUNT.AR && l.credit > 0),
    cashIn: sumWhere(entries, (l) => l.account === ACCOUNT.CASH && l.debit > 0),
    cashOut: sumWhere(entries, (l) => l.account === ACCOUNT.CASH && l.credit > 0),
    bankIn: sumWhere(entries, (l) => l.account === ACCOUNT.BANK && l.debit > 0),
    bankOut: sumWhere(entries, (l) => l.account === ACCOUNT.BANK && l.credit > 0),
  };
  summary.netCash = summary.cashIn - summary.cashOut;
  summary.netBank = summary.bankIn - summary.bankOut;

  // Cash Flow: one row per entry that moved the (single, storewide) cash
  // drawer, with a running balance across the day — starts at 0 rather than
  // the drawer's real historical balance, same day-scoped convention as the
  // "Cash On Hand" summary card above.
  let cashRunning = 0;
  const cashFlowRows = [];
  for (const e of entries) {
    const cashLine = e.lines.find((l) => l.account === ACCOUNT.CASH);
    if (!cashLine) continue;
    const cashIn = cashLine.debit || 0;
    const cashOut = cashLine.credit || 0;
    cashRunning += cashIn - cashOut;
    cashFlowRows.push({
      id: String(e.id),
      date: e.date,
      voucherNo: e.refNo || '',
      description: e.description || VOUCHER_LABELS[e.refType] || e.refType,
      cashIn,
      cashOut,
      balance: cashRunning,
    });
  }

  // Bank Reconciliation: one row per entry that settled into a bank account
  // (`line.ref` is the BankAccount id — see paymentService.settlementAccount),
  // resolved to that bank's name in one follow-up query. A transaction ID
  // isn't its own column anywhere yet (see recordPayment in saleService),
  // just embedded in the description as "Txn ID: <value>" — parsed back out
  // here so it lines up under its own header.
  const bankLines = [];
  const bankAccountIds = new Set();
  for (const e of entries) {
    const bankLine = e.lines.find((l) => l.account === ACCOUNT.BANK);
    if (!bankLine) continue;
    bankLines.push({ entry: e, line: bankLine });
    if (bankLine.ref) bankAccountIds.add(String(bankLine.ref));
  }
  const bankAccounts = bankAccountIds.size
    ? await BankAccount.findAll({ where: { id: Array.from(bankAccountIds) } })
    : [];
  const bankNameById = new Map(bankAccounts.map((b) => [String(b.id), b.bankName || b.name]));
  const TXN_ID_RE = /Txn ID:\s*([^—]+)/i;
  const bankReconciliationRows = bankLines.map(({ entry: e, line }) => {
    const match = (e.description || '').match(TXN_ID_RE);
    return {
      id: String(e.id),
      date: e.date,
      voucherNo: e.refNo || '',
      description: e.description || VOUCHER_LABELS[e.refType] || e.refType,
      bankName: (line.ref && bankNameById.get(String(line.ref))) || '—',
      transactionId: match ? match[1].trim() : '',
      amount: (line.debit || 0) - (line.credit || 0),
    };
  });

  return {
    title: 'Day Book',
    columns: [
      { key: 'date', label: 'Date' },
      { key: 'voucherLabel', label: 'Type' },
      { key: 'voucherNo', label: 'Voucher #' },
      { key: 'description', label: 'Description' },
      { key: 'warehouse', label: 'Warehouse' },
      { key: 'amount', label: 'Amount', numeric: true },
    ],
    rows,
    summary,
    cashFlowRows,
    bankReconciliationRows,
  };
}

// Plain-language names for journal accounts, for the entry-detail view.
const ACCOUNT_LABELS = {
  [ACCOUNT.CASH]: 'Cash',
  [ACCOUNT.BANK]: 'Bank',
  [ACCOUNT.INVENTORY]: 'Inventory',
  [ACCOUNT.AR]: 'Customer receivable',
  [ACCOUNT.AR_VENDOR]: 'Vendor receivable',
  [ACCOUNT.AP]: 'Vendor payable',
  [ACCOUNT.AP_SUPPLIER]: 'Supplier payable',
  [ACCOUNT.AP_LABOUR]: 'Labour payable',
  [ACCOUNT.AP_TRANSPORT]: 'Transport payable',
  [ACCOUNT.SALES]: 'Sales',
  [ACCOUNT.COGS]: 'Cost of goods sold',
  [ACCOUNT.OPERATING_EXPENSE]: 'Operating expense',
  [ACCOUNT.TAX]: 'Sales tax',
  [ACCOUNT.EQUITY]: 'Equity',
};

// Which model a line's `ref` points at, per account.
const PARTY_MODEL = {
  [ACCOUNT.AR]: 'Customer',
  [ACCOUNT.AR_VENDOR]: 'Vendor',
  [ACCOUNT.AP]: 'Vendor',
  [ACCOUNT.AP_SUPPLIER]: 'Supplier',
  [ACCOUNT.AP_LABOUR]: 'Labour',
  [ACCOUNT.AP_TRANSPORT]: 'Transporter',
  [ACCOUNT.BANK]: 'BankAccount',
};

/**
 * One Day Book entry in full, for the click-through detail modal: when it
 * was posted and by whom, every debit/credit line with its party resolved
 * to a name, and — for a sale or an expense — the source document itself.
 * Returns paisa; the controller converts to rupees.
 */
async function getDayBookEntry(actor, id) {
  const models = initializeModels();
  const { JournalEntry, JournalLine, Warehouse, Store, User, Sale, SaleItem, Expense } = models;
  const entry = await JournalEntry.findByPk(id, {
    include: [
      { model: JournalLine, as: 'lines', separate: true, order: [['position', 'ASC']] },
      { model: Warehouse, as: 'warehouseInfo', attributes: ['id', 'name'] },
      { model: Store, as: 'storeInfo', attributes: ['id', 'name'] },
      { model: User, as: 'creator', attributes: ['id', 'name'] },
    ],
  });
  if (!entry) throw ApiError.notFound('Entry not found');
  if (entry.store) assertStoreAccess(actor, entry.store);

  const refsByModel = new Map();
  for (const l of entry.lines) {
    const model = PARTY_MODEL[l.account];
    if (!model || !l.ref) continue;
    if (!refsByModel.has(model)) refsByModel.set(model, new Set());
    refsByModel.get(model).add(String(l.ref));
  }
  const partyName = new Map();
  for (const [model, ids] of refsByModel) {
    const docs = await models[model].findAll({ where: { id: Array.from(ids) } });
    for (const d of docs) {
      const name = model === 'BankAccount' ? d.bankName || d.name : d.name;
      partyName.set(`${model}:${d.id}`, name);
    }
  }

  let document = null;
  if ((entry.refType === REF.SALE || entry.refType === REF.SALE_RETURN) && entry.refNo) {
    const sale = await Sale.findOne({
      where:
        entry.refType === REF.SALE && entry.refId ? { id: entry.refId } : { number: entry.refNo },
      include: [{ model: SaleItem, as: 'items', separate: true, order: [['position', 'ASC']] }],
    });
    if (sale) {
      document = {
        kind: 'SALE',
        number: sale.number,
        customerName: sale.customerName,
        paymentMethod: sale.paymentMethod,
        subtotal: sale.subtotal,
        discount: sale.discount,
        tax: sale.tax,
        transportFare: sale.transportFare,
        labourRent: sale.labourRent,
        total: sale.total,
        items: sale.items.map((it) => ({
          name: it.name,
          quantity: it.quantity,
          unitPrice: it.unitPrice,
          lineTotal: it.lineTotal,
        })),
      };
    }
  } else if (entry.refType === REF.EXPENSE) {
    const expense = await Expense.findOne({ where: { journalEntry: entry.id } });
    if (expense) {
      document = {
        kind: 'EXPENSE',
        number: expense.number,
        categoryName: expense.categoryName,
        method: expense.method,
        amount: expense.amount,
        note: expense.note,
      };
    }
  }

  return {
    id: String(entry.id),
    date: entry.date,
    createdAt: entry.createdAt,
    voucherType: entry.refType,
    voucherLabel: VOUCHER_LABELS[entry.refType] || entry.refType,
    voucherNo: entry.refNo || '',
    description: entry.description || '',
    storeName: entry.storeInfo ? entry.storeInfo.name : '',
    warehouseName: entry.warehouseInfo ? entry.warehouseInfo.name : '',
    createdByName: entry.creator ? entry.creator.name : '',
    lines: entry.lines.map((l) => {
      const model = PARTY_MODEL[l.account];
      return {
        account: l.account,
        accountLabel: ACCOUNT_LABELS[l.account] || l.account,
        partyName: model && l.ref ? partyName.get(`${model}:${l.ref}`) || '' : '',
        debit: l.debit || 0,
        credit: l.credit || 0,
      };
    }),
    document,
  };
}

const REPORTS = {
  sales: salesReport,
  'stock-valuation': stockValuationReport,
  'profit-loss': profitAndLossReport,
  'day-book': dayBookReport,
};

async function runReport(type, params) {
  if (!Object.prototype.hasOwnProperty.call(REPORTS, type)) {
    throw ApiError.badRequest(`Unknown report type: ${type}`);
  }
  const fn = REPORTS[type];
  const { Store, Warehouse } = initializeModels();

  // `store` takes precedence over a plain `warehouse` — resolves to the list
  // of warehouse ids every report filters on. The single-warehouse doc below
  // is only for meta display, and only fetched on the legacy single-warehouse
  // path (a store's own warehouse list is its own meta.store instead).
  const { warehouseIds } = await resolveWarehouseScope(params);
  // A store-restricted actor's own store(s) always win over the `store`/
  // `warehouse` query params — resolveStoreScope throws if an explicit
  // `store` param isn't one of theirs, so a multi-store actor can't widen
  // (or hop sideways) into another tenant's store by passing its id here.
  const { storeIds } = await resolveStoreScope({ store: params.store, actor: params.actor });
  let warehouse = null;
  let store = null;
  if (storeIds && storeIds.length === 1) {
    store = await Store.findByPk(storeIds[0], { attributes: ['id', 'name', 'code'] });
  } else if (!storeIds && params.warehouse) {
    warehouse = await Warehouse.findByPk(params.warehouse);
    if (!warehouse) throw ApiError.notFound('Warehouse not found');
  }

  const report = await fn({ ...params, warehouseIds, store: storeIds });
  return {
    ...report,
    meta: {
      generatedAt: new Date(),
      period:
        type === 'stock-valuation' ? null : { from: params.from || null, to: params.to || null },
      basis: type === 'stock-valuation' ? 'CURRENT' : 'PERIOD',
      warehouse: warehouseInfo(warehouse),
      store: store ? { id: String(store.id), name: store.name, code: store.code || '' } : null,
      scope: store ? 'STORE' : warehouse ? 'WAREHOUSE' : 'ALL_WAREHOUSES',
    },
  };
}

module.exports = {
  salesReport,
  stockValuationReport,
  profitAndLossReport,
  dayBookReport,
  getDayBookEntry,
  runReport,
};
