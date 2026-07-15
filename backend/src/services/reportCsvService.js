const { toRupees } = require('../utils/money');
const ApiError = require('../utils/ApiError');
const { formatReportDate } = require('../utils/reportDate');

const REPORT_COLUMNS = {
  sales: [
    ['Type', 'documentType'],
    ['Sale / Invoice Number', 'number'],
    ['Date', 'date', 'date'],
    ['Warehouse', 'warehouse'],
    ['Warehouse Location', 'warehouseLocation'],
    ['Warehouse Address', 'warehouseAddress'],
    ['Customer', 'customer'],
    ['Customer Phone', 'customerPhone'],
    ['Customer Email', 'customerEmail'],
    ['Customer Address', 'customerAddress'],
    ['Items', 'itemCount'],
    ['Quantity', 'quantity'],
    ['Payment Method', 'paymentMethod'],
    ['Subtotal', 'subtotal', 'money'],
    ['Discount', 'discount', 'money'],
    ['Taxable Amount', 'taxableAmount', 'money'],
    ['Tax Rate (%)', 'taxPercent'],
    ['Tax', 'tax', 'money'],
    ['Cash', 'cash', 'money'],
    ['Online', 'online', 'money'],
    ['Credit', 'credit', 'money'],
    ['Paid', 'paid', 'money'],
    ['Balance', 'balance', 'money'],
    ['Total', 'total', 'money'],
  ],
  purchases: [
    ['Purchase Number', 'number'],
    ['Vendor Invoice', 'vendorInvoiceNo'],
    ['Date', 'date', 'date'],
    ['Warehouse', 'warehouse'],
    ['Warehouse Location', 'warehouseLocation'],
    ['Warehouse Address', 'warehouseAddress'],
    ['Vendor', 'vendor'],
    ['Vendor Phone', 'vendorPhone'],
    ['Vendor Email', 'vendorEmail'],
    ['Vendor NTN', 'vendorNtn'],
    ['Vendor Address', 'vendorAddress'],
    ['Items', 'itemCount'],
    ['Quantity', 'quantity'],
    ['Payment Method', 'paymentMethod'],
    ['Subtotal', 'subtotal', 'money'],
    ['Discount', 'discount', 'money'],
    ['Taxable Amount', 'taxableAmount', 'money'],
    ['Tax', 'tax', 'money'],
    ['Total', 'total', 'money'],
    ['Paid', 'paid', 'money'],
    ['Balance', 'balance', 'money'],
  ],
  'stock-valuation': [
    ['Product', 'product'],
    ['SKU', 'sku'],
    ['Unit', 'unit'],
    ['Warehouse', 'warehouse'],
    ['Warehouse Location', 'warehouseLocation'],
    ['Warehouse Address', 'warehouseAddress'],
    ['Quantity', 'quantity'],
    ['Average Cost', 'avgCost', 'money'],
    ['Value', 'value', 'money'],
    ['Minimum Stock', 'minStock'],
    ['Low Stock', 'lowStock', 'boolean'],
  ],
  'profit-loss': [
    ['Item', 'item'],
    ['Amount', 'amount', 'money'],
  ],
};

const SUMMARY_COLUMNS = {
  sales: [
    ['Record Count', 'count'],
    ['Item Lines', 'itemCount'],
    ['Quantity Sold', 'quantity'],
    ['Subtotal', 'subtotal', 'money'],
    ['Discount', 'discount', 'money'],
    ['Taxable Amount', 'taxableAmount', 'money'],
    ['Tax', 'tax', 'money'],
    ['Cash Total', 'cash', 'money'],
    ['Online Total', 'online', 'money'],
    ['Credit Total', 'credit', 'money'],
    ['Paid Total', 'paid', 'money'],
    ['Outstanding Balance', 'balance', 'money'],
    ['Grand Total', 'total', 'money'],
  ],
  purchases: [
    ['Record Count', 'count'],
    ['Item Lines', 'itemCount'],
    ['Quantity Purchased', 'quantity'],
    ['Subtotal', 'subtotal', 'money'],
    ['Discount', 'discount', 'money'],
    ['Taxable Amount', 'taxableAmount', 'money'],
    ['Tax', 'tax', 'money'],
    ['Purchase Total', 'total', 'money'],
    ['Paid Total', 'paid', 'money'],
    ['Balance Total', 'balance', 'money'],
  ],
  'stock-valuation': [
    ['Record Count', 'count'],
    ['Unique Products', 'productCount'],
    ['Total Quantity', 'quantity'],
    ['Low Stock Items', 'lowStockCount'],
    ['Inventory Value', 'total', 'money'],
  ],
  'profit-loss': [
    ['Revenue', 'revenue', 'money'],
    ['Cost of Goods Sold', 'cogs', 'money'],
    ['Gross Profit', 'grossProfit', 'money'],
    ['Operating Expenses', 'expenses', 'money'],
    ['Net Profit', 'netProfit', 'money'],
  ],
};

function formatValue(value, type) {
  if (value === null || value === undefined) return '';
  if (type === 'money') return toRupees(value).toFixed(2);
  if (type === 'boolean') return value ? 'Yes' : 'No';
  if (type === 'date') {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '' : formatReportDate(date);
  }
  return String(value);
}

// Quote according to RFC 4180 and neutralize spreadsheet-formula prefixes.
function csvCell(value, trustedNumeric = false) {
  let text = String(value ?? '');
  if (!trustedNumeric && /^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

function row(values) {
  return values.map(csvCell).join(',');
}

function reportRow(columns, record) {
  return columns
    .map(([, key, valueType]) => {
      const value = record[key];
      const trustedNumeric = valueType === 'money' || typeof value === 'number';
      return csvCell(formatValue(value, valueType), trustedNumeric);
    })
    .join(',');
}

function generateReportCsv(type, data) {
  if (!Object.prototype.hasOwnProperty.call(REPORT_COLUMNS, type)) {
    throw ApiError.badRequest(`Unknown report type: ${type}`);
  }
  const lines = [];
  const columns = REPORT_COLUMNS[type];

  if (data.title || data.meta) {
    lines.push(row(['Report', data.title || type]));
    if (data.meta && data.meta.period) {
      lines.push(row(['From', data.meta.period.from || 'All time']));
      lines.push(row(['To', data.meta.period.to || 'All time']));
    }
    if (data.meta && data.meta.warehouse) {
      lines.push(row(['Warehouse', data.meta.warehouse.name]));
      lines.push(row(['Location', data.meta.warehouse.location]));
      lines.push(row(['Address', data.meta.warehouse.address]));
    } else if (data.meta) {
      lines.push(row(['Warehouse', 'All warehouses']));
    }
    if (data.meta && data.meta.generatedAt) {
      lines.push(row(['Generated At', new Date(data.meta.generatedAt).toISOString()]));
    }
    lines.push('');
  }

  if (columns) {
    lines.push(row(columns.map(([label]) => label)));
    for (const record of data.rows || []) {
      lines.push(reportRow(columns, record));
    }
    lines.push('');
  }

  const summaryColumns = SUMMARY_COLUMNS[type];
  const summary = type === 'profit-loss' ? data.summary || data : data.summary || {};
  lines.push(row(['Summary', 'Value']));
  for (const [label, key, valueType] of summaryColumns || []) {
    lines.push(
      [csvCell(label), csvCell(formatValue(summary[key], valueType), valueType === 'money')].join(
        ',',
      ),
    );
  }

  // A UTF-8 BOM keeps Excel from misreading non-ASCII customer/product names.
  return `\uFEFF${lines.join('\r\n')}\r\n`;
}

module.exports = { generateReportCsv };
