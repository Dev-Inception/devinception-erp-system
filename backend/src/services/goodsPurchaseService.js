const GoodsPurchase = require('../models/goodsPurchaseModel');
const Vendor = require('../models/vendorModel');
const Product = require('../models/productModel');
const BankAccount = require('../models/bankAccountModel');
const ApiError = require('../utils/ApiError');
const { toPaisa } = require('../utils/money');
const { ACCOUNT, REF, PAYMENT_METHOD, BANK_METHODS } = require('../utils/finance');
const journalService = require('./journalService');
const stockService = require('./stockService');
const paymentService = require('./paymentService');
const counterService = require('./counterService');
const { parsePagination } = require('../utils/query');
const { requirePositiveQuantity } = require('../utils/quantity');
const { assertProductWarehouse } = require('../utils/productWarehouse');
const invoiceService = require('./invoiceService');

/**
 * Goods purchase flow. Validates everything up front, then: raises stock,
 * records the purchase, and posts the journals. On a standalone MongoDB there
 * are no multi-document transactions, so the order is chosen so a failure
 * leaves no partial financial record (validate → number → doc → stock → post).
 */

// Resolve the settlement account (cash drawer or a bank account) for a method.
async function settlementAccount(method, bankAccountId) {
  if (BANK_METHODS.has(method)) {
    if (!bankAccountId)
      throw ApiError.badRequest('A bank account is required for this payment method');
    const bank = await BankAccount.findById(bankAccountId);
    if (!bank) throw ApiError.notFound('Bank account not found');
    return { account: ACCOUNT.BANK, ref: bank._id };
  }
  if (method === PAYMENT_METHOD.CASH) return { account: ACCOUNT.CASH, ref: null };
  throw ApiError.badRequest('Unsupported payment method for a purchase');
}

// Allocate an order-level discount across gross line totals without losing or
// inventing paisa. Floors are assigned first, then the remaining paisa go to
// the lines with the largest fractional remainders.
function allocateDiscountedLineTotals(grossAmounts, discount) {
  const subtotal = grossAmounts.reduce((sum, gross) => sum + gross, 0);
  const target = subtotal - discount;
  if (subtotal === 0) return grossAmounts.map(() => 0);

  const allocations = [];
  const remainders = [];
  let allocated = 0;
  grossAmounts.forEach((gross, index) => {
    const exact = (gross * target) / subtotal;
    const base = Math.floor(exact);
    allocations[index] = base;
    allocated += base;
    remainders.push({ index, fraction: exact - base });
  });

  remainders.sort((a, b) => b.fraction - a.fraction || a.index - b.index);
  for (let i = 0; i < target - allocated; i += 1) {
    allocations[remainders[i].index] += 1;
  }
  return allocations;
}

async function createPurchase(actor, input) {
  const {
    vendor,
    warehouse,
    date,
    items,
    discount = 0,
    vendorInvoiceNo,
    paid = 0,
    paymentMethod,
    bankAccount,
    notes,
  } = input;

  const vendorDoc = await Vendor.findById(vendor);
  if (!vendorDoc) throw ApiError.notFound('Vendor not found');

  if (!Array.isArray(items) || items.length === 0) {
    throw ApiError.badRequest('At least one item is required');
  }

  const wh = warehouse
    ? await require('./warehouseService').getWarehouseById(warehouse)
    : await stockService.ensureDefaultWarehouse();

  // First pass: gross line totals (before any discount) to size the discount.
  const parsed = [];
  let subtotal = 0;
  for (const it of items) {
    const product = await Product.findById(it.product);
    if (!product) throw ApiError.notFound(`Product not found: ${it.product}`);
    assertProductWarehouse(product, wh);
    const quantity = requirePositiveQuantity(it.quantity, 'Item quantity must be positive');
    const enteredUnitCost = toPaisa(it.unitCost);
    if (enteredUnitCost < 0) throw ApiError.badRequest('Item unit cost must be non-negative');
    const gross = Math.round(quantity * enteredUnitCost);
    subtotal += gross;
    const taxPct = it.taxPercent === undefined ? 0 : Number(it.taxPercent);
    if (!Number.isFinite(taxPct) || taxPct < 0 || taxPct > 100) {
      throw ApiError.badRequest('Item tax % must be 0–100');
    }
    parsed.push({ product, quantity, gross, enteredUnitCost, taxPct });
  }

  const discountPaisa = toPaisa(discount);
  if (discountPaisa < 0) throw ApiError.badRequest('Discount must be non-negative');
  if (discountPaisa > subtotal) throw ApiError.badRequest('Discount cannot exceed the subtotal');

  // Allocate the order-level discount across lines so inventory is valued at
  // the net (discounted) cost. Per-line tax is charged on the net line amount.
  const allocatedLineTotals = allocateDiscountedLineTotals(
    parsed.map((line) => line.gross),
    discountPaisa,
  );
  let net = 0;
  let totalTax = 0;
  const lineItems = [];
  for (const [index, p] of parsed.entries()) {
    const lineNet = allocatedLineTotals[index];
    const unitCost = p.quantity > 0 ? Math.round(lineNet / p.quantity) : 0;
    const tax = Math.round((lineNet * p.taxPct) / 100);
    net += lineNet;
    totalTax += tax;
    lineItems.push({
      product: p.product._id,
      name: p.product.name,
      quantity: p.quantity,
      unitCost,
      taxPercent: p.taxPct,
      tax,
      lineTotal: lineNet,
    });
  }

  const total = net + totalTax; // grand total payable
  const paidPaisa = toPaisa(paid);
  if (paidPaisa < 0) throw ApiError.badRequest('Paid amount cannot be negative');
  if (paidPaisa > total) throw ApiError.badRequest('Paid amount cannot exceed the purchase total');

  // The GP form captures no payment method; default to cash when an amount is
  // paid so the purchase posts without the UI having to send one. Paying by
  // bank still works by passing BANK_TRANSFER/CARD/ONLINE + a bank account.
  let settle = null;
  let method = paymentMethod;
  if (paidPaisa > 0) {
    method = method || PAYMENT_METHOD.CASH;
    settle = await settlementAccount(method, bankAccount);
    await paymentService.assertSufficientFunds(settle.account, settle.ref, paidPaisa);
  }

  const when = date ? new Date(date) : new Date();
  const number = await counterService.nextDocNumber('GP', when.getFullYear(), 4);

  const purchase = await GoodsPurchase.create({
    number,
    vendorInvoiceNo: vendorInvoiceNo || '',
    vendor: vendorDoc._id,
    vendorName: vendorDoc.name,
    warehouse: wh._id,
    date: when,
    items: lineItems,
    subtotal,
    discount: discountPaisa,
    tax: totalTax,
    total,
    paid: paidPaisa,
    balance: total - paidPaisa,
    paymentMethod: paidPaisa > 0 ? method : undefined,
    bankAccount: settle && settle.account === ACCOUNT.BANK ? settle.ref : null,
    notes: notes || '',
    createdBy: actor ? actor._id : null,
  });

  // Raise stock at the net (discounted) unit cost.
  for (const li of lineItems) {
    await stockService.receiveStock(
      li.product,
      wh._id,
      li.quantity,
      li.unitCost,
      {
        refType: REF.PURCHASE,
        refNo: number,
        date: when,
      },
      li.lineTotal,
    );
  }

  // Keep the catalog's expected buying rate in step with the latest purchase:
  // set each product's purchasePrice to the (entered) rate it was just bought
  // at. Inventory is still valued at the moving-average avgCost; this only
  // refreshes the catalog figure shown in Products and prefilled in the GP form.
  for (const p of parsed) {
    await Product.updateOne({ _id: p.product._id }, { purchasePrice: p.enteredUnitCost });
  }

  // Purchase posting: Dr Inventory (net) + Dr Tax (input) / Cr A-P (grand total).
  const purchaseLines = [journalService.line(ACCOUNT.INVENTORY, { debit: net })];
  if (totalTax > 0) purchaseLines.push(journalService.line(ACCOUNT.TAX, { debit: totalTax }));
  purchaseLines.push(journalService.line(ACCOUNT.AP, { credit: total, ref: vendorDoc._id }));

  if (total > 0) {
    await journalService.post({
      date: when,
      description: `Goods purchase ${number}`,
      refType: REF.PURCHASE,
      refId: purchase._id,
      refNo: number,
      warehouse: wh._id,
      createdBy: actor ? actor._id : null,
      lines: purchaseLines,
    });
  }

  // Immediate payment, if any: Dr A/P / Cr Cash|Bank.
  if (paidPaisa > 0) {
    await journalService.post({
      date: when,
      description: `Payment for ${number}`,
      refType: REF.PAYMENT,
      refId: purchase._id,
      refNo: number,
      warehouse: wh._id,
      createdBy: actor ? actor._id : null,
      lines: [
        journalService.line(ACCOUNT.AP, { debit: paidPaisa, ref: vendorDoc._id }),
        journalService.line(settle.account, { credit: paidPaisa, ref: settle.ref }),
      ],
    });
  }

  // Persist the downloadable vendor invoice after the purchase, stock, and
  // accounting entries have all been recorded successfully.
  await invoiceService.createFromPurchase(purchase._id);

  return purchase;
}

async function listPurchases({ vendor, from, to, ...query } = {}) {
  const { page, limit, skip } = parsePagination(query);
  const filter = {};
  if (vendor) filter.vendor = vendor;
  if (from || to) {
    filter.date = {};
    if (from) filter.date.$gte = new Date(from);
    if (to) filter.date.$lte = new Date(to);
  }

  const [purchases, total] = await Promise.all([
    GoodsPurchase.find(filter)
      .populate('vendor', 'name')
      .sort({ date: -1, createdAt: -1 })
      .skip(skip)
      .limit(limit),
    GoodsPurchase.countDocuments(filter),
  ]);

  return { purchases, total, page, limit };
}

async function getPurchaseById(id) {
  const purchase = await GoodsPurchase.findById(id)
    .populate('vendor', 'name phone')
    .populate('warehouse', 'name');
  if (!purchase) throw ApiError.notFound('Purchase not found');
  return purchase;
}

module.exports = {
  createPurchase,
  listPurchases,
  getPurchaseById,
  settlementAccount,
  allocateDiscountedLineTotals,
};
