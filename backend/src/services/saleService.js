const mongoose = require('mongoose');
const Sale = require('../models/saleModel');
const Store = require('../models/storeModel');
const Customer = require('../models/customerModel');
const Labour = require('../models/labourModel');
const Vendor = require('../models/vendorModel');
const Product = require('../models/productModel');
const StockLevel = require('../models/stockLevelModel');
const BankAccount = require('../models/bankAccountModel');
const ApiError = require('../utils/ApiError');
const { toPaisa, toRupees } = require('../utils/money');
const { ACCOUNT, REF, PAYMENT_METHOD, BANK_METHODS } = require('../utils/finance');
const journalService = require('./journalService');
const stockService = require('./stockService');
const counterService = require('./counterService');
const { calculateInvoiceTotals, resolveUnitPrice } = require('./invoiceCalculationService');
const { parsePagination } = require('../utils/query');
const { normalizeQuantity, requirePositiveQuantity } = require('../utils/quantity');
const {
  resolveWarehouseScope,
  warehouseMongoFilter,
  actorStoreId,
  assertStoreAccess,
} = require('../utils/storeScope');
const gatePassService = require('./gatePassService');

/**
 * POS sale flow. Resolves how the sale is settled (cash / bank / on account),
 * checks stock up front, then records the sale, issues stock (capturing COGS),
 * and posts two balanced journal entries: revenue and cost of goods sold.
 */

// Work out the cash / online / credit split (paisa) for the chosen method.
function resolveSettlement({ method, total, cashReceived, onlineReceived }) {
  let cash = 0;
  let online = 0;

  if (method === PAYMENT_METHOD.CASH) {
    cash = total;
  } else if (BANK_METHODS.has(method)) {
    online = total;
  } else if (method === PAYMENT_METHOD.MIXED) {
    cash = toPaisa(cashReceived || 0);
    online = toPaisa(onlineReceived || 0);
    // The POS "Mixed" mode splits the full total across cash + online and has
    // no on-account remainder, but it allows over-tender (and shows change).
    // Reject a short tender; treat any excess as change by capping the booked
    // amounts at the total (online first, then cash — the drawer gives change
    // from cash), instead of erroring on an exact-match mismatch.
    if (cash + online < total) {
      throw ApiError.badRequest('Mixed payment: cash + online must cover the sale total');
    }
    online = Math.min(online, total);
    cash = total - online;
  } else if (method === PAYMENT_METHOD.CREDIT) {
    // entirely on account
  } else {
    throw ApiError.badRequest('Unsupported payment method');
  }

  if (cash < 0 || online < 0) throw ApiError.badRequest('Payment amounts cannot be negative');
  const credit = total - cash - online;
  if (credit < 0) throw ApiError.badRequest('Amount tendered exceeds the sale total');
  return { cash, online, credit };
}

// Resolves a raw `items` request array into priced, warehouse-checked sale
// lines — validating stock per (product, warehouse) pair rather than
// assuming one warehouse for the whole cart. Shared by createSale (fresh
// stock) and updateSale (stock already reversed by the caller first).
async function resolveSaleLineItems(items, defaultWarehouse, warehouseService) {
  const unresolvedLines = [];
  const requestedByKey = new Map();
  const warehouseCache = new Map([[String(defaultWarehouse._id), defaultWarehouse]]);
  // The first warehouse-sourced line's warehouse — becomes the sale's
  // "primary" warehouse, kept for reports/dashboards/journal tagging.
  let primaryWarehouse = null;

  for (const it of items) {
    const product = await Product.findById(it.product);
    if (!product) throw ApiError.notFound(`Product not found: ${it.product}`);
    const quantity = requirePositiveQuantity(it.quantity, 'Item quantity must be positive');
    const unitPrice = resolveUnitPrice(it.unitPrice, product.salePrice);

    // A line becomes vendor-sourced whenever a vendor is attached — the two
    // dropdowns (warehouse / vendor) are independent, but picking a vendor
    // means this item is procured specially rather than pulled from stock.
    let vendorDoc = null;
    if (it.vendor) {
      vendorDoc = await Vendor.findById(it.vendor);
      if (!vendorDoc) throw ApiError.notFound(`Vendor not found: ${it.vendor}`);
    }
    const source = vendorDoc ? 'VENDOR' : 'WAREHOUSE';

    let lineWarehouse = null;
    if (source === 'WAREHOUSE') {
      const warehouseKey = it.warehouse ? String(it.warehouse) : String(defaultWarehouse._id);
      lineWarehouse = warehouseCache.get(warehouseKey);
      if (!lineWarehouse) {
        lineWarehouse = await warehouseService.getWarehouseById(warehouseKey);
        warehouseCache.set(warehouseKey, lineWarehouse);
      }
      if (!primaryWarehouse) primaryWarehouse = lineWarehouse;

      // Only stock-backed lines are tied to their warehouse and need
      // available stock — a vendor-sourced line isn't pulled from inventory.
      // A product can be stocked (via StockLevel) in more than one warehouse;
      // the availability check just below is the real guard, so any
      // warehouse that actually holds stock of it is a valid source.
      const requestKey = `${product._id}:${lineWarehouse._id}`;
      const requested = requirePositiveQuantity(
        (requestedByKey.get(requestKey) || 0) + quantity,
        'Requested item quantity is too large',
      );
      requestedByKey.set(requestKey, requested);
      const level = await StockLevel.findOne({
        product: product._id,
        warehouse: lineWarehouse._id,
      });
      const available = level ? normalizeQuantity(level.quantity) : Number.NaN;
      if (!Number.isFinite(available) || available < requested) {
        throw ApiError.badRequest(`Insufficient stock for ${product.name}`);
      }
    }
    unresolvedLines.push({
      product: product._id,
      name: product.name,
      quantity,
      unitPrice,
      source,
      warehouse: lineWarehouse ? lineWarehouse._id : null,
      vendor: vendorDoc ? vendorDoc._id : null,
      vendorName: vendorDoc ? vendorDoc.name : '',
    });
  }

  return { unresolvedLines, primaryWarehouse };
}

// Reverses the revenue + COGS journal entries a sale posted at checkout time,
// by reconstructing them from the sale's own stored totals (deterministic —
// the same fields that were used to build the original entries) and posting
// the mirror image. Journal entries are append-only, so a correction is
// always "reverse, then post fresh" rather than editing the original.
// Payments recorded later via recordPayment are separate entries and are
// untouched here.
async function reverseSaleJournalEntries(sale, actor, when) {
  const originalNet = sale.subtotal - sale.discount;
  const salesCredit = originalNet + sale.transportFare + sale.labourRent;

  const reverseLines = [];
  if (sale.cashAmount > 0)
    reverseLines.push(journalService.line(ACCOUNT.CASH, { credit: sale.cashAmount }));
  if (sale.onlineAmount > 0)
    reverseLines.push(
      journalService.line(ACCOUNT.BANK, { credit: sale.onlineAmount, ref: sale.bankAccount }),
    );
  if (sale.creditAmount > 0)
    reverseLines.push(
      journalService.line(ACCOUNT.AR, { credit: sale.creditAmount, ref: sale.customer }),
    );
  if (salesCredit > 0)
    reverseLines.push(journalService.line(ACCOUNT.SALES, { debit: salesCredit }));
  if (sale.tax > 0) reverseLines.push(journalService.line(ACCOUNT.TAX, { debit: sale.tax }));

  if (reverseLines.length > 0) {
    await journalService.post({
      date: when,
      description: `Reversal for edited sale ${sale.number}`,
      refType: REF.SALE,
      refId: sale._id,
      refNo: sale.number,
      warehouse: sale.warehouse,
      store: sale.store,
      createdBy: actor ? actor._id : null,
      lines: reverseLines,
    });
  }

  if (sale.cost > 0) {
    await journalService.post({
      date: when,
      description: `COGS reversal for edited sale ${sale.number}`,
      refType: REF.SALE,
      refId: sale._id,
      refNo: sale.number,
      warehouse: sale.warehouse,
      store: sale.store,
      createdBy: actor ? actor._id : null,
      lines: [
        journalService.line(ACCOUNT.COGS, { credit: sale.cost }),
        journalService.line(ACCOUNT.INVENTORY, { debit: sale.cost }),
      ],
    });
  }
}

async function createSale(actor, input) {
  const {
    customer,
    store,
    warehouse,
    date,
    items,
    labour = [],
    discount = 0,
    taxPercent = 0,
    transportFare = 0,
    transport = {},
    payment = {},
  } = input;

  if (!Array.isArray(items) || items.length === 0) {
    throw ApiError.badRequest('At least one item is required');
  }
  const method = payment.method;
  if (!method) throw ApiError.badRequest('A payment method is required');

  // Every sale happens at one physical storefront — required so every
  // invoice records, permanently, which shop the customer was actually in.
  const storeDoc = await Store.findById(store);
  if (!storeDoc) throw ApiError.badRequest('A store is required');
  assertStoreAccess(actor, storeDoc._id);

  const customerDoc = customer ? await Customer.findById(customer) : null;
  if (customer && !customerDoc) throw ApiError.notFound('Customer not found');

  const warehouseService = require('./warehouseService');
  // Fallback warehouse for lines that don't name their own (and for an
  // all-vendor sale, which still needs a warehouse to satisfy the schema).
  const defaultWarehouse = warehouse
    ? await warehouseService.getWarehouseById(warehouse)
    : await stockService.ensureDefaultWarehouse();

  // Accepts either a plain array of labour ids, or `{ labour, rent }` objects
  // when each labourer has a per-job charge attached.
  const labourInput = Array.isArray(labour) ? labour : [];
  const labourIds = Array.from(
    new Set(
      labourInput
        .map((l) => (l && typeof l === 'object' ? l.labour : l))
        .filter(Boolean)
        .map(String),
    ),
  );
  const labourDocs = labourIds.length ? await Labour.find({ _id: { $in: labourIds } }) : [];
  if (labourDocs.length !== labourIds.length) {
    throw ApiError.badRequest('One or more labour entries are invalid');
  }
  const rentByLabour = new Map(
    labourInput
      .filter((l) => l && typeof l === 'object' && l.labour)
      .map((l) => [String(l.labour), toPaisa(l.rent || 0)]),
  );
  const saleLabour = labourDocs.map((doc) => ({
    labour: doc._id,
    name: doc.name,
    phoneNumber: doc.phoneNumber,
    rent: rentByLabour.get(String(doc._id)) || 0,
  }));
  const labourRentPaisa = saleLabour.reduce((s, l) => s + l.rent, 0);

  // Build line items (paisa) and pre-check stock so we never half-sell. A
  // sale can mix lines from several warehouses — each WAREHOUSE-sourced line
  // resolves its own warehouse (falling back to `defaultWarehouse`), and
  // stock is validated per (product, warehouse) pair rather than assuming
  // one warehouse for the whole cart.
  const { unresolvedLines, primaryWarehouse } = await resolveSaleLineItems(
    items,
    defaultWarehouse,
    warehouseService,
  );
  // A fully vendor-sourced sale has no warehouse-sourced line to derive a
  // primary warehouse from — fall back to the resolved default.
  const wh = primaryWarehouse || defaultWarehouse;

  // Use the shared authoritative totals engine so persisted sale amounts apply
  // discounts before tax and remain consistent across reports and receipts.
  const calculated = calculateInvoiceTotals(unresolvedLines, { discount, taxPercent });
  const lineItems = calculated.items;
  const {
    subtotal,
    discount: discountPaisa,
    taxableAmount: net,
    taxPercent: taxPct,
    tax,
    total: itemsTotal,
  } = calculated;

  const transportFarePaisa = toPaisa(transportFare || 0);
  const total = itemsTotal + transportFarePaisa + labourRentPaisa;

  const { cash, online, credit } = resolveSettlement({
    method,
    total,
    cashReceived: payment.cash,
    onlineReceived: payment.online,
  });

  // Credit (on account) requires a real customer to owe the balance.
  if (credit > 0 && !customerDoc) {
    throw ApiError.badRequest('A customer is required for a credit (unpaid) sale');
  }

  // Any online/bank-settled portion needs proof of transfer (the POS blocks
  // the charge until a receipt is attached), so enforce it server-side too.
  const receiptRef = (payment.receiptRef || '').trim();
  if (online > 0 && !receiptRef) {
    throw ApiError.badRequest('A transfer receipt is required for online payments');
  }

  // A bank/online portion lands in a specific bank account when given,
  // otherwise in the generic "online/bank" account (ref null) — the POS
  // collects online payments without picking an account.
  let bankRef = null;
  if (online > 0 && payment.bankAccount) {
    const bank = await BankAccount.findById(payment.bankAccount);
    if (!bank) throw ApiError.notFound('Bank account not found');
    bankRef = bank._id;
  }

  const when = date ? new Date(date) : new Date();
  const number = await counterService.nextDocNumber('SALE', when.getFullYear(), 6);

  // Issue stock and capture COGS per line, each from its own warehouse —
  // vendor-sourced lines have neither, since they were never actually in any
  // warehouse's inventory.
  let cost = 0;
  for (const li of lineItems) {
    if (li.source === 'VENDOR') {
      li.cost = 0;
      continue;
    }
    const lineCost = await stockService.issueStock(li.product, li.warehouse, li.quantity, {
      refType: REF.SALE,
      refNo: number,
      date: when,
    });
    li.cost = lineCost;
    cost += lineCost;
  }

  const sale = await Sale.create({
    number,
    customer: customerDoc ? customerDoc._id : null,
    customerName: customerDoc ? customerDoc.name : 'Walk-in',
    store: storeDoc._id,
    warehouse: wh._id,
    date: when,
    items: lineItems,
    labour: saleLabour,
    transport: {
      driverName: (transport.driverName || '').trim(),
      driverPhone: (transport.driverPhone || '').trim(),
      vehicleNumber: (transport.vehicleNumber || '').trim(),
    },
    subtotal,
    discount: discountPaisa,
    taxPercent: taxPct,
    tax,
    transportFare: transportFarePaisa,
    labourRent: labourRentPaisa,
    total,
    cost,
    paymentMethod: method,
    cashAmount: cash,
    onlineAmount: online,
    creditAmount: credit,
    bankAccount: bankRef,
    transferReceiptRef: receiptRef,
    createdBy: actor ? actor._id : null,
  });

  // Revenue: Dr Cash/Bank/Receivable ... Cr Sales (total).
  const revenueLines = [];
  if (cash > 0) revenueLines.push(journalService.line(ACCOUNT.CASH, { debit: cash }));
  if (online > 0)
    revenueLines.push(journalService.line(ACCOUNT.BANK, { debit: online, ref: bankRef }));
  if (credit > 0)
    revenueLines.push(journalService.line(ACCOUNT.AR, { debit: credit, ref: customerDoc._id }));
  // Transport fare and labour rent are booked as sales revenue alongside the
  // goods themselves — there's no dedicated freight/labour-income account,
  // and they're services the sale is charging for either way.
  const salesCredit = net + transportFarePaisa + labourRentPaisa;
  if (salesCredit > 0)
    revenueLines.push(journalService.line(ACCOUNT.SALES, { credit: salesCredit }));
  if (tax > 0) revenueLines.push(journalService.line(ACCOUNT.TAX, { credit: tax }));

  // A fully discounted sale has no revenue/payment entry, but still records
  // its inventory/COGS movement below. Avoid posting an invalid all-zero entry.
  if (revenueLines.length > 0) {
    await journalService.post({
      date: when,
      description: `POS sale ${number}`,
      refType: REF.SALE,
      refId: sale._id,
      refNo: number,
      warehouse: wh._id,
      store: storeDoc._id,
      createdBy: actor ? actor._id : null,
      lines: revenueLines,
    });
  }

  // Cost of goods sold: Dr COGS / Cr Inventory.
  if (cost > 0) {
    await journalService.post({
      date: when,
      description: `COGS ${number}`,
      refType: REF.SALE,
      refId: sale._id,
      refNo: number,
      warehouse: wh._id,
      store: storeDoc._id,
      createdBy: actor ? actor._id : null,
      lines: [
        journalService.line(ACCOUNT.COGS, { debit: cost }),
        journalService.line(ACCOUNT.INVENTORY, { credit: cost }),
      ],
    });
  }

  // The sale, stock deduction, and journal entries are already committed by
  // this point — a gate-pass hiccup (e.g. a stale index, a transient error)
  // must not fail the whole sale. Gate passes self-heal on next view
  // (see gatePassService.refreshSourceIfNeeded), so on failure just log and
  // return the sale with whatever got linked before the error, instead of
  // bubbling the error up and telling the POS the sale failed when it didn't.
  try {
    const { warehouseGatePasses, vendorGatePass } =
      await gatePassService.createGatePassesForSale(sale);
    sale.warehouseGatePasses = warehouseGatePasses;
    if (warehouseGatePasses[0]) sale.gatePass = warehouseGatePasses[0].gatePass;
    if (vendorGatePass) sale.vendorGatePass = vendorGatePass._id;
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error(`Gate pass creation failed for sale ${number}:`, error);
    const persisted = await Sale.findById(sale._id);
    if (persisted) {
      sale.warehouseGatePasses = persisted.warehouseGatePasses;
      sale.gatePass = persisted.gatePass;
      sale.vendorGatePass = persisted.vendorGatePass;
    }
  }

  return sale;
}

/**
 * Full invoice edit — replaces a sale's items (and discount/tax/transport/
 * labour) and recalculates totals, reversing and reapplying stock + the
 * revenue/COGS journal entries. Cash/bank amounts already collected at the
 * original checkout are left untouched; only the resulting credit (on
 * account) balance is recalculated. Blocked once the sale has any returns
 * against it — combining an in-place edit with return-adjusted line
 * quantities/stock/COGS is a correctness minefield, so returns must be
 * un-done (not supported) before a sale can be edited again.
 *
 * Not wrapped in a DB transaction (this is a standalone-Mongo app, like the
 * rest of the finance flows) — if stock validation fails partway through,
 * the original sale's stock has already been reversed but the Sale document
 * itself hasn't changed yet, same class of best-effort risk createSale
 * already accepts for a single checkout's multi-line stock issuance.
 */
async function updateSale(actor, saleId, input) {
  const sale = await Sale.findById(saleId);
  if (!sale) throw ApiError.notFound('Sale not found');
  assertStoreAccess(actor, sale.store);
  if (sale.returnedTotal > 0) {
    throw ApiError.badRequest(
      'This sale has product returns against it and can no longer be edited',
    );
  }

  const {
    warehouse,
    items,
    labour,
    discount = 0,
    taxPercent = 0,
    transportFare = 0,
    transport = {},
  } = input;

  if (!Array.isArray(items) || items.length === 0) {
    throw ApiError.badRequest('At least one item is required');
  }

  const warehouseService = require('./warehouseService');
  const defaultWarehouse = warehouse
    ? await warehouseService.getWarehouseById(warehouse)
    : await warehouseService.getWarehouseById(sale.warehouse);

  // The edit form doesn't expose re-picking labour — omitting `labour`
  // entirely leaves the sale's existing labour/labourRent untouched. Only an
  // explicit `labour` array (including `[]`, to clear it) replaces it.
  let saleLabour = sale.labour;
  let labourRentPaisa = sale.labourRent;
  if (labour !== undefined) {
    // Accepts either a plain array of labour ids, or `{ labour, rent }`
    // objects when each labourer has a per-job charge attached.
    const labourInput = Array.isArray(labour) ? labour : [];
    const labourIds = Array.from(
      new Set(
        labourInput
          .map((l) => (l && typeof l === 'object' ? l.labour : l))
          .filter(Boolean)
          .map(String),
      ),
    );
    const labourDocs = labourIds.length ? await Labour.find({ _id: { $in: labourIds } }) : [];
    if (labourDocs.length !== labourIds.length) {
      throw ApiError.badRequest('One or more labour entries are invalid');
    }
    const rentByLabour = new Map(
      labourInput
        .filter((l) => l && typeof l === 'object' && l.labour)
        .map((l) => [String(l.labour), toPaisa(l.rent || 0)]),
    );
    saleLabour = labourDocs.map((doc) => ({
      labour: doc._id,
      name: doc.name,
      phoneNumber: doc.phoneNumber,
      rent: rentByLabour.get(String(doc._id)) || 0,
    }));
    labourRentPaisa = saleLabour.reduce((s, l) => s + l.rent, 0);
  }

  // Reverse the sale's original stock issuance before validating the revised
  // line items, so an edit that keeps similar quantities doesn't spuriously
  // fail "insufficient stock" against a warehouse the sale already drew from.
  // Restocked at the exact original cost, so the moving average is undone
  // precisely rather than blended with today's average.
  for (const li of sale.items) {
    if (li.source === 'VENDOR' || !li.warehouse || !li.quantity) continue;
    await stockService.receiveStock(
      li.product,
      li.warehouse,
      li.quantity,
      0,
      { refType: REF.SALE, refNo: sale.number, date: new Date() },
      li.cost,
    );
  }

  const { unresolvedLines, primaryWarehouse } = await resolveSaleLineItems(
    items,
    defaultWarehouse,
    warehouseService,
  );
  const wh = primaryWarehouse || defaultWarehouse;

  const calculated = calculateInvoiceTotals(unresolvedLines, { discount, taxPercent });
  const lineItems = calculated.items;
  const {
    subtotal,
    discount: discountPaisa,
    taxPercent: taxPct,
    tax,
    total: itemsTotal,
  } = calculated;

  const transportFarePaisa = toPaisa(transportFare || 0);
  const total = itemsTotal + transportFarePaisa + labourRentPaisa;

  // What was already collected at the original checkout doesn't change on an
  // item edit — only what's still owed does. Clamp at zero for the rare case
  // an edit brings the new total below what's already been collected.
  const newCredit = Math.max(0, total - sale.cashAmount - sale.onlineAmount);
  if (newCredit > 0 && !sale.customer) {
    throw ApiError.badRequest('A customer is required for a credit (unpaid) sale');
  }

  const when = new Date();

  // Issue new stock and capture COGS per line, each from its own warehouse.
  let cost = 0;
  for (const li of lineItems) {
    if (li.source === 'VENDOR') {
      li.cost = 0;
      continue;
    }
    const lineCost = await stockService.issueStock(li.product, li.warehouse, li.quantity, {
      refType: REF.SALE,
      refNo: sale.number,
      date: sale.date,
    });
    li.cost = lineCost;
    cost += lineCost;
  }

  // Reverse the original revenue + COGS entries (using the sale's own
  // pre-edit stored totals), then post fresh ones below for the revised sale.
  await reverseSaleJournalEntries(sale, actor, when);

  sale.items = lineItems;
  sale.labour = saleLabour;
  sale.transport = {
    driverName: (transport.driverName ?? sale.transport?.driverName ?? '').trim(),
    driverPhone: (transport.driverPhone ?? sale.transport?.driverPhone ?? '').trim(),
    vehicleNumber: (transport.vehicleNumber ?? sale.transport?.vehicleNumber ?? '').trim(),
  };
  sale.warehouse = wh._id;
  sale.subtotal = subtotal;
  sale.discount = discountPaisa;
  sale.taxPercent = taxPct;
  sale.tax = tax;
  sale.transportFare = transportFarePaisa;
  sale.labourRent = labourRentPaisa;
  sale.total = total;
  sale.cost = cost;
  sale.creditAmount = newCredit;
  sale.lastEditedAt = when;
  sale.lastEditedBy = actor ? actor._id : null;
  await sale.save();

  const revenueLines = [];
  if (sale.cashAmount > 0)
    revenueLines.push(journalService.line(ACCOUNT.CASH, { debit: sale.cashAmount }));
  if (sale.onlineAmount > 0)
    revenueLines.push(
      journalService.line(ACCOUNT.BANK, { debit: sale.onlineAmount, ref: sale.bankAccount }),
    );
  if (newCredit > 0)
    revenueLines.push(journalService.line(ACCOUNT.AR, { debit: newCredit, ref: sale.customer }));
  const salesCredit = subtotal - discountPaisa + transportFarePaisa + labourRentPaisa;
  if (salesCredit > 0)
    revenueLines.push(journalService.line(ACCOUNT.SALES, { credit: salesCredit }));
  if (tax > 0) revenueLines.push(journalService.line(ACCOUNT.TAX, { credit: tax }));

  if (revenueLines.length > 0) {
    await journalService.post({
      date: when,
      description: `Revised sale ${sale.number}`,
      refType: REF.SALE,
      refId: sale._id,
      refNo: sale.number,
      warehouse: wh._id,
      store: sale.store,
      createdBy: actor ? actor._id : null,
      lines: revenueLines,
    });
  }

  if (cost > 0) {
    await journalService.post({
      date: when,
      description: `COGS for revised sale ${sale.number}`,
      refType: REF.SALE,
      refId: sale._id,
      refNo: sale.number,
      warehouse: wh._id,
      store: sale.store,
      createdBy: actor ? actor._id : null,
      lines: [
        journalService.line(ACCOUNT.COGS, { debit: cost }),
        journalService.line(ACCOUNT.INVENTORY, { credit: cost }),
      ],
    });
  }

  // Same non-fatal treatment as createSale — the edit itself already
  // succeeded and is committed; a gate-pass hiccup shouldn't undo that.
  try {
    const { warehouseGatePasses, vendorGatePass } =
      await gatePassService.createGatePassesForSale(sale);
    sale.warehouseGatePasses = warehouseGatePasses;
    if (warehouseGatePasses[0]) sale.gatePass = warehouseGatePasses[0].gatePass;
    sale.vendorGatePass = vendorGatePass ? vendorGatePass._id : null;
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error(`Gate pass refresh failed for edited sale ${sale.number}:`, error);
  }

  return sale;
}

/**
 * Records a payment collected after checkout against a specific sale's
 * remaining balance (e.g. "customer pays in full after delivery"). Posts the
 * same Dr Cash|Bank / Cr Accounts-Receivable entry a general customer receipt
 * would, but tagged to this sale (refType SALE) rather than a standalone
 * receipt, so it's traceable to the invoice it settles.
 */
async function recordPayment(actor, saleId, { amount, method, bankAccount, note }) {
  const sale = await Sale.findById(saleId);
  if (!sale) throw ApiError.notFound('Sale not found');
  assertStoreAccess(actor, sale.store);
  if (!sale.customer) {
    throw ApiError.badRequest('This sale has no customer on account to receive payment from');
  }

  const amt = toPaisa(amount);
  if (amt <= 0) throw ApiError.badRequest('Amount must be positive');

  const remaining = Math.max(
    0,
    sale.total -
      sale.returnedTotal -
      sale.cashAmount -
      sale.onlineAmount -
      sale.additionalPaidAmount,
  );
  if (amt > remaining) {
    throw ApiError.badRequest('Amount exceeds the remaining balance on this sale');
  }

  const paymentService = require('./paymentService');
  const settle = await paymentService.settlementAccount(method, bankAccount);
  const when = new Date();

  await journalService.post({
    date: when,
    description: note || `Payment received for sale ${sale.number}`,
    refType: REF.SALE,
    refId: sale._id,
    refNo: sale.number,
    store: sale.store,
    createdBy: actor ? actor._id : null,
    lines: [
      journalService.line(settle.account, { debit: amt, ref: settle.ref }),
      journalService.line(ACCOUNT.AR, { credit: amt, ref: sale.customer }),
    ],
  });

  sale.additionalPaidAmount += amt;
  await sale.save();
  return sale;
}

async function listSales({
  customer,
  warehouse,
  store,
  from,
  to,
  paymentMethod,
  actor,
  ...query
} = {}) {
  const { page, limit, skip } = parsePagination(query);
  const filter = {};
  if (customer) filter.customer = customer;
  if (paymentMethod) filter.paymentMethod = paymentMethod;
  // Every sale now records its own storefront directly — filter on that
  // rather than the indirect (and looser) warehouse-membership scoping,
  // which only every sale's `warehouse` field, not which shop it happened at.
  // A store-restricted actor's own store always wins over the query param.
  const effectiveStore = actorStoreId(actor) || store;
  if (effectiveStore && mongoose.isValidObjectId(effectiveStore)) {
    filter.store = effectiveStore;
  } else if (warehouse) {
    const { warehouseIds } = await resolveWarehouseScope({ warehouse, actor });
    Object.assign(filter, warehouseMongoFilter(warehouseIds));
  }
  if (from || to) {
    filter.date = {};
    if (from) filter.date.$gte = new Date(from);
    if (to) filter.date.$lte = new Date(to);
  }

  const [sales, total] = await Promise.all([
    Sale.find(filter)
      .populate('store', 'name code')
      .sort({ date: -1, createdAt: -1 })
      .skip(skip)
      .limit(limit),
    Sale.countDocuments(filter),
  ]);

  return { sales, total, page, limit };
}

async function getSaleById(actor, id) {
  const sale = await Sale.findById(id)
    .populate('customer', 'name phone')
    .populate('store', 'name code')
    .populate('warehouse', 'name');
  if (!sale) throw ApiError.notFound('Sale not found');
  assertStoreAccess(actor, sale.store?._id ?? sale.store);
  return sale;
}

/**
 * The customer's receivable balance immediately before and after this sale
 * posted — the "Previous Balance" / "Total Remaining" shown on the printed
 * invoice. A snapshot at the sale's own moment in time, not the customer's
 * live current balance, so a reprint later still reflects what the customer
 * saw at checkout. Null for walk-in sales (no customer to carry a balance).
 */
async function getSaleBalances(sale) {
  const customerId = sale.customer?._id ?? sale.customer;
  if (!customerId) return { previousBalance: null, totalRemaining: null };

  const at = sale.date instanceof Date ? sale.date : new Date(sale.date);
  const justBefore = new Date(at.getTime() - 1);
  const [previous, remaining] = await Promise.all([
    journalService.balanceAsOf(ACCOUNT.AR, customerId, justBefore),
    journalService.balanceAsOf(ACCOUNT.AR, customerId, at),
  ]);
  return { previousBalance: toRupees(previous), totalRemaining: toRupees(remaining) };
}

module.exports = {
  createSale,
  updateSale,
  recordPayment,
  listSales,
  getSaleById,
  getSaleBalances,
};
