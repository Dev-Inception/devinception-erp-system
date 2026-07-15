const Sale = require('../models/saleModel');
const GoodsPurchase = require('../models/goodsPurchaseModel');
const Warehouse = require('../models/warehouseModel');
const ApiError = require('../utils/ApiError');
const { ACCOUNT, REF } = require('../utils/finance');
const journalService = require('./journalService');
const stockService = require('./stockService');
const { parseReportDate } = require('../utils/reportDate');
const { normalizeQuantity } = require('../utils/quantity');

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
 * collection, and the span is capped to keep result sets bounded.
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
  return { date: { $gte: range.from, $lte: range.to } };
}

function warehouseInfo(warehouse) {
  if (!warehouse) return null;
  return {
    id: String(warehouse._id),
    name: warehouse.name,
    location: warehouse.location || '',
    address: warehouse.address || '',
    isDefault: !!warehouse.isDefault,
  };
}

// Sales report: Sale is the sole sales source. Purchase invoices are backed by
// GoodsPurchase and never participate in revenue reporting.
async function salesReport({ from, to, warehouse }) {
  const filter = requireRange({ from, to });
  if (warehouse) filter.warehouse = warehouse;
  const sales = await Sale.find(filter)
    .populate('customer', 'name phone email address')
    .populate('warehouse', 'name location address isDefault')
    .sort({ date: -1, createdAt: -1 })
    .lean();

  const saleRows = sales.map((s) => {
    const wh = warehouseInfo(s.warehouse);
    return {
      id: String(s._id),
      documentType: 'SALE',
      number: s.number,
      date: s.date,
      customerId: s.customer ? String(s.customer._id || s.customer) : null,
      customer: s.customerName,
      customerDetails:
        s.customer && s.customer._id
          ? {
              id: String(s.customer._id),
              name: s.customer.name || s.customerName,
              phone: s.customer.phone || '',
              email: s.customer.email || '',
              address: s.customer.address || '',
            }
          : null,
      customerPhone: s.customer && s.customer.phone ? s.customer.phone : '',
      customerEmail: s.customer && s.customer.email ? s.customer.email : '',
      customerAddress: s.customer && s.customer.address ? s.customer.address : '',
      warehouse: wh ? wh.name : '—',
      warehouseLocation: wh ? wh.location : '',
      warehouseAddress: wh ? wh.address : '',
      warehouseIsDefault: wh ? wh.isDefault : false,
      warehouseDetails: wh,
      itemCount: (s.items || []).length,
      quantity: normalizeQuantity((s.items || []).reduce((sum, item) => sum + item.quantity, 0)),
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

  const rows = saleRows;

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

// Purchases report: one row per purchase + total/paid/balance summary.
async function purchasesReport({ from, to, warehouse }) {
  const filter = requireRange({ from, to });
  if (warehouse) filter.warehouse = warehouse;
  const purchases = await GoodsPurchase.find(filter)
    .populate('vendor', 'name phone email ntn address')
    .populate('warehouse', 'name location address isDefault')
    .sort({ date: -1, createdAt: -1 })
    .lean();

  const rows = purchases.map((p) => {
    const wh = warehouseInfo(p.warehouse);
    return {
      id: String(p._id),
      number: p.number,
      vendorInvoiceNo: p.vendorInvoiceNo || '',
      date: p.date,
      vendorId: p.vendor ? String(p.vendor._id) : null,
      vendor: p.vendor ? p.vendor.name : p.vendorName || '—',
      vendorDetails: p.vendor
        ? {
            id: String(p.vendor._id),
            name: p.vendor.name,
            phone: p.vendor.phone || '',
            email: p.vendor.email || '',
            ntn: p.vendor.ntn || '',
            address: p.vendor.address || '',
          }
        : null,
      vendorPhone: p.vendor ? p.vendor.phone || '' : '',
      vendorEmail: p.vendor ? p.vendor.email || '' : '',
      vendorNtn: p.vendor ? p.vendor.ntn || '' : '',
      vendorAddress: p.vendor ? p.vendor.address || '' : '',
      warehouse: wh ? wh.name : '—',
      warehouseLocation: wh ? wh.location : '',
      warehouseAddress: wh ? wh.address : '',
      warehouseIsDefault: wh ? wh.isDefault : false,
      warehouseDetails: wh,
      itemCount: (p.items || []).length,
      quantity: normalizeQuantity((p.items || []).reduce((sum, item) => sum + item.quantity, 0)),
      subtotal: p.subtotal,
      discount: p.discount,
      taxableAmount: p.subtotal - p.discount,
      tax: p.tax,
      total: p.total,
      paid: p.paid,
      balance: p.balance,
      paymentMethod: p.paymentMethod || '',
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
      acc.total += r.total;
      acc.paid += r.paid;
      acc.balance += r.balance;
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
      total: 0,
      paid: 0,
      balance: 0,
    },
  );

  return {
    title: 'Purchase Report',
    columns: [
      { key: 'number', label: 'GP #' },
      { key: 'vendorInvoiceNo', label: 'Vendor Invoice' },
      { key: 'date', label: 'Date' },
      { key: 'warehouse', label: 'Warehouse' },
      { key: 'vendor', label: 'Vendor' },
      { key: 'subtotal', label: 'Subtotal', numeric: true },
      { key: 'discount', label: 'Discount', numeric: true },
      { key: 'taxableAmount', label: 'Taxable Amount', numeric: true },
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
async function stockValuationReport({ warehouse }) {
  const { rows, total } = await stockService.valuation({ warehouse });
  const detailRows = rows.map((r) => ({
    productId: String(r.product._id),
    product: r.product.name,
    sku: r.product.sku || '',
    unit: r.product.unit ? r.product.unit.abbreviation || r.product.unit.name : '',
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
async function profitAndLossReport({ from, to, warehouse }) {
  const normalized = normalizeRange({ from, to }, false);
  const range = normalized || {};
  const expenseRange = normalized ? { ...normalized } : {};
  if (warehouse) {
    const sourceFilter = { warehouse };
    if (normalized) sourceFilter.date = { $gte: normalized.from, $lte: normalized.to };
    const saleIds = await Sale.find(sourceFilter).distinct('_id');
    range.refType = REF.SALE;
    range.refIds = saleIds;
    expenseRange.warehouse = warehouse;
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

const REPORTS = {
  sales: salesReport,
  purchases: purchasesReport,
  'stock-valuation': stockValuationReport,
  'profit-loss': profitAndLossReport,
};

async function runReport(type, params) {
  if (!Object.prototype.hasOwnProperty.call(REPORTS, type)) {
    throw ApiError.badRequest(`Unknown report type: ${type}`);
  }
  const fn = REPORTS[type];
  let warehouse = null;
  if (params.warehouse) {
    warehouse = await Warehouse.findById(params.warehouse).lean();
    if (!warehouse) throw ApiError.notFound('Warehouse not found');
  }
  const report = await fn({ ...params, warehouse: warehouse ? warehouse._id : undefined });
  return {
    ...report,
    meta: {
      generatedAt: new Date(),
      period:
        type === 'stock-valuation' ? null : { from: params.from || null, to: params.to || null },
      basis: type === 'stock-valuation' ? 'CURRENT' : 'PERIOD',
      warehouse: warehouseInfo(warehouse),
      scope: warehouse ? 'WAREHOUSE' : 'ALL_WAREHOUSES',
    },
  };
}

module.exports = {
  salesReport,
  purchasesReport,
  stockValuationReport,
  profitAndLossReport,
  runReport,
};
