const GoodsPurchase = require("../models/goodsPurchaseModel");
const Vendor = require("../models/vendorModel");
const Product = require("../models/productModel");
const BankAccount = require("../models/bankAccountModel");
const ApiError = require("../utils/ApiError");
const { toPaisa } = require("../utils/money");
const { ACCOUNT, REF, PAYMENT_METHOD, BANK_METHODS } = require("../utils/finance");
const journalService = require("./journalService");
const stockService = require("./stockService");
const counterService = require("./counterService");
const { parsePagination } = require("../utils/query");

/**
 * Goods purchase flow. Validates everything up front, then: raises stock,
 * records the purchase, and posts the journals. On a standalone MongoDB there
 * are no multi-document transactions, so the order is chosen so a failure
 * leaves no partial financial record (validate → number → doc → stock → post).
 */

// Resolve the settlement account (cash drawer or a bank account) for a method.
async function settlementAccount(method, bankAccountId) {
  if (BANK_METHODS.has(method)) {
    if (!bankAccountId) throw ApiError.badRequest("A bank account is required for this payment method");
    const bank = await BankAccount.findById(bankAccountId);
    if (!bank) throw ApiError.notFound("Bank account not found");
    return { account: ACCOUNT.BANK, ref: bank._id };
  }
  if (method === PAYMENT_METHOD.CASH) return { account: ACCOUNT.CASH, ref: null };
  throw ApiError.badRequest("Unsupported payment method for a purchase");
}

async function createPurchase(actor, input) {
  const { vendor, warehouse, date, items, discount = 0, vendorInvoiceNo, paid = 0, paymentMethod, bankAccount, notes } = input;

  const vendorDoc = await Vendor.findById(vendor);
  if (!vendorDoc) throw ApiError.notFound("Vendor not found");

  if (!Array.isArray(items) || items.length === 0) {
    throw ApiError.badRequest("At least one item is required");
  }

  const wh = warehouse
    ? await require("./warehouseService").getWarehouseById(warehouse)
    : await stockService.ensureDefaultWarehouse();

  // First pass: gross line totals (before any discount) to size the discount.
  const parsed = [];
  let subtotal = 0;
  for (const it of items) {
    const product = await Product.findById(it.product);
    if (!product) throw ApiError.notFound(`Product not found: ${it.product}`);
    const quantity = Number(it.quantity);
    if (!(quantity > 0)) throw ApiError.badRequest("Item quantity must be positive");
    const gross = Math.round(quantity * toPaisa(it.unitCost));
    subtotal += gross;
    parsed.push({ product, quantity, gross, taxPct: Number(it.taxPercent) || 0 });
  }

  const discountPaisa = toPaisa(discount);
  if (discountPaisa > subtotal) throw ApiError.badRequest("Discount cannot exceed the subtotal");

  // Allocate the order-level discount across lines so inventory is valued at
  // the net (discounted) cost. Per-line tax is charged on the net line amount.
  const factor = subtotal > 0 ? (subtotal - discountPaisa) / subtotal : 1;
  let net = 0;
  let totalTax = 0;
  const lineItems = [];
  for (const p of parsed) {
    const lineNet = Math.round(p.gross * factor);
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
  if (paidPaisa < 0) throw ApiError.badRequest("Paid amount cannot be negative");
  if (paidPaisa > total) throw ApiError.badRequest("Paid amount cannot exceed the purchase total");

  let settle = null;
  if (paidPaisa > 0) {
    if (!paymentMethod) throw ApiError.badRequest("A payment method is required when paying");
    settle = await settlementAccount(paymentMethod, bankAccount);
  }

  const when = date ? new Date(date) : new Date();
  const number = await counterService.nextDocNumber("GP", when.getFullYear(), 4);

  const purchase = await GoodsPurchase.create({
    number,
    vendorInvoiceNo: vendorInvoiceNo || "",
    vendor: vendorDoc._id,
    warehouse: wh._id,
    date: when,
    items: lineItems,
    subtotal,
    discount: discountPaisa,
    tax: totalTax,
    total,
    paid: paidPaisa,
    balance: total - paidPaisa,
    paymentMethod: paidPaisa > 0 ? paymentMethod : undefined,
    bankAccount: settle && settle.account === ACCOUNT.BANK ? settle.ref : null,
    notes: notes || "",
    createdBy: actor ? actor._id : null,
  });

  // Raise stock at the net (discounted) unit cost.
  for (const li of lineItems) {
    await stockService.receiveStock(li.product, wh._id, li.quantity, li.unitCost, {
      refType: REF.PURCHASE,
      refNo: number,
      date: when,
    });
  }

  // Purchase posting: Dr Inventory (net) + Dr Tax (input) / Cr A-P (grand total).
  const purchaseLines = [journalService.line(ACCOUNT.INVENTORY, { debit: net })];
  if (totalTax > 0) purchaseLines.push(journalService.line(ACCOUNT.TAX, { debit: totalTax }));
  purchaseLines.push(journalService.line(ACCOUNT.AP, { credit: total, ref: vendorDoc._id }));

  await journalService.post({
    date: when,
    description: `Goods purchase ${number}`,
    refType: REF.PURCHASE,
    refId: purchase._id,
    refNo: number,
    createdBy: actor ? actor._id : null,
    lines: purchaseLines,
  });

  // Immediate payment, if any: Dr A/P / Cr Cash|Bank.
  if (paidPaisa > 0) {
    await journalService.post({
      date: when,
      description: `Payment for ${number}`,
      refType: REF.PAYMENT,
      refId: purchase._id,
      refNo: number,
      createdBy: actor ? actor._id : null,
      lines: [
        journalService.line(ACCOUNT.AP, { debit: paidPaisa, ref: vendorDoc._id }),
        journalService.line(settle.account, { credit: paidPaisa, ref: settle.ref }),
      ],
    });
  }

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
      .populate("vendor", "name")
      .sort({ date: -1, createdAt: -1 })
      .skip(skip)
      .limit(limit),
    GoodsPurchase.countDocuments(filter),
  ]);

  return { purchases, total, page, limit };
}

async function getPurchaseById(id) {
  const purchase = await GoodsPurchase.findById(id)
    .populate("vendor", "name phone")
    .populate("warehouse", "name");
  if (!purchase) throw ApiError.notFound("Purchase not found");
  return purchase;
}

module.exports = { createPurchase, listPurchases, getPurchaseById, settlementAccount };
