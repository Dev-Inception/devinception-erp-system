const mongoose = require('mongoose');
const Sale = require('../models/saleModel');
const Store = require('../models/storeModel');
const Customer = require('../models/customerModel');
const Vendor = require('../models/vendorModel');
const Transporter = require('../models/transporterModel');
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
const pendingEntityService = require('./pendingEntityService');
const paymentService = require('./paymentService');
const labourService = require('./labourService');
const dayEndService = require('./dayEndService');

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

// Looks up an optional Transporter reference — a sale is free to have none
// at all (the free-text transport.driverName/driverPhone still works
// standalone), but if an id is given it must resolve to a real transporter.
async function resolveTransporter(transporterId) {
  if (!transporterId) return null;
  const transporter = await Transporter.findById(transporterId);
  if (!transporter) throw ApiError.notFound('Transporter not found');
  return transporter;
}

// Resolves and validates the transport-fare settlement up front, mirroring
// stockReceiptService's resolveTruckFarePayment. Only relevant when a
// transporter is attached — with no transporter, the fare stays purely
// informational/revenue exactly as it's always been (returns null). With a
// transporter and no method, the fare is simply owed to them (still
// returns a resolved amount, with `settle: null`).
async function resolveTransportFarePayment(transportFarePaisa, transporterId, method, bankAccount) {
  if (!transporterId || transportFarePaisa <= 0) return null;
  if (!method) return { amount: transportFarePaisa, settle: null };
  const settle = await paymentService.settlementAccount(method, bankAccount);
  await paymentService.assertSufficientFunds(settle.account, settle.ref, transportFarePaisa);
  return { amount: transportFarePaisa, settle };
}

// Posts the transporter-side expense/payable for a sale's transport fare —
// Dr Operating Expense / Cr AP_TRANSPORT(ref=transporter) always, plus
// Dr AP_TRANSPORT(ref)/Cr Cash|Bank when settled immediately. No-op with no
// transporter attached — see resolveTransportFarePayment.
async function postTransportFareExpense(sale, resolved, actor) {
  if (!resolved) return;
  const base = {
    date: sale.date,
    refId: sale._id,
    refNo: sale.number,
    warehouse: sale.warehouse,
    store: sale.store,
    createdBy: actor ? actor._id : null,
  };
  await journalService.post({
    ...base,
    refType: REF.EXPENSE,
    description: `Transport fare charged to transporter for sale ${sale.number}`,
    lines: [
      journalService.line(ACCOUNT.OPERATING_EXPENSE, { debit: resolved.amount }),
      journalService.line(ACCOUNT.AP_TRANSPORT, { credit: resolved.amount, ref: sale.transporter }),
    ],
  });
  if (resolved.settle) {
    await journalService.post({
      ...base,
      refType: REF.PAYMENT,
      description: `Transport fare paid to transporter for sale ${sale.number}`,
      lines: [
        journalService.line(ACCOUNT.AP_TRANSPORT, {
          debit: resolved.amount,
          ref: sale.transporter,
        }),
        journalService.line(resolved.settle.account, {
          credit: resolved.amount,
          ref: resolved.settle.ref,
        }),
      ],
    });
  }
}

// Mirror of postTransportFareExpense with debit/credit swapped — undoes a
// sale's original transport-fare charge (and payment, if any) using the
// sale's own stored fields, called before an edit posts a fresh one.
async function reverseTransportFareExpense(sale, actor) {
  if (!sale.transporter || !sale.transportFare) return;
  const base = {
    date: new Date(),
    refId: sale._id,
    refNo: sale.number,
    warehouse: sale.warehouse,
    store: sale.store,
    createdBy: actor ? actor._id : null,
  };
  await journalService.post({
    ...base,
    refType: REF.EXPENSE,
    description: `Reversal of transport fare charge for sale ${sale.number}`,
    lines: [
      journalService.line(ACCOUNT.AP_TRANSPORT, {
        debit: sale.transportFare,
        ref: sale.transporter,
      }),
      journalService.line(ACCOUNT.OPERATING_EXPENSE, { credit: sale.transportFare }),
    ],
  });
  if (sale.transportFareMethod) {
    const settle = await paymentService.settlementAccount(
      sale.transportFareMethod,
      sale.transportFareBankAccount,
    );
    await journalService.post({
      ...base,
      refType: REF.PAYMENT,
      description: `Reversal of transport fare payment for sale ${sale.number}`,
      lines: [
        journalService.line(settle.account, { debit: sale.transportFare, ref: settle.ref }),
        journalService.line(ACCOUNT.AP_TRANSPORT, {
          credit: sale.transportFare,
          ref: sale.transporter,
        }),
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
    transporter,
    transportFareMethod,
    transportFareBankAccount,
    payment = {},
    // Set when this checkout is converting an existing estimate — marked
    // CONVERTED below once the sale has actually posted.
    estimate,
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

  const saleLabour = await labourService.resolveLabourLines(labour);
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

  const transporterDoc = await resolveTransporter(transporter);
  // Validated (and funds checked) up front, before any stock is touched —
  // an insufficient-funds problem should reject the whole sale.
  const transportFareResolved = await resolveTransportFarePayment(
    transportFarePaisa,
    transporterDoc && transporterDoc._id,
    transportFareMethod,
    transportFareBankAccount,
  );

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
    if (bank.store && String(bank.store) !== String(storeDoc._id)) {
      throw ApiError.badRequest('That bank account does not belong to this store');
    }
    bankRef = bank._id;
  }

  const when = date ? new Date(date) : new Date();
  await dayEndService.assertDayOpen(actor, storeDoc._id, when);
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
    transporter: transporterDoc ? transporterDoc._id : null,
    transportFareMethod:
      transportFareResolved && transportFareResolved.settle ? transportFareMethod : null,
    transportFareBankAccount:
      transportFareResolved && transportFareResolved.settle
        ? transportFareResolved.settle.ref
        : null,
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

  // Labour payable: the rent charged to the customer was already booked as
  // SALES revenue above — this books the matching expense/liability to the
  // labourer, which nothing did before. Dr Operating Expense / Cr AP_LABOUR
  // per labourer with a rent, in one balanced entry.
  await labourService.postLabourPayable(saleLabour, {
    when,
    refType: REF.SALE,
    refNo: number,
    store: storeDoc._id,
    actor,
    label: 'sale',
  });

  // Transporter payable: same idea as labour above, but only when a
  // registered transporter is attached — a sale with only free-text driver
  // details posts nothing here, exactly as before this feature existed.
  await postTransportFareExpense(sale, transportFareResolved, actor);

  // Vendor-sourced lines have no known cost yet — each becomes a Pending
  // Entity for a super admin to price later (see pendingEntityService). Not
  // fatal: the sale itself is already committed.
  try {
    await pendingEntityService.recordSaleVendorItems(
      sale,
      lineItems.filter((li) => li.source === 'VENDOR'),
      actor,
    );
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error(`Pending entity creation failed for sale ${number}:`, error);
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

  // Same best-effort treatment as gate passes above — the sale itself is
  // already committed, so a hiccup marking the estimate converted must not
  // fail (or appear to fail) the sale.
  if (estimate) {
    try {
      await require('./estimateService').markConverted(estimate, sale._id);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error(`Marking estimate ${estimate} converted failed for sale ${number}:`, error);
    }
  }

  if (sale.transporter) await sale.populate('transporter', 'name phone vehicleNumber');
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
    transporter,
    transportFareMethod,
    transportFareBankAccount,
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
    saleLabour = await labourService.resolveLabourLines(labour);
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

  const transporterDoc = await resolveTransporter(transporter);
  // Validated (and funds checked) up front — before the reversal below posts
  // anything — same fail-fast placement as createSale.
  const transportFareResolved = await resolveTransportFarePayment(
    transportFarePaisa,
    transporterDoc && transporterDoc._id,
    transportFareMethod,
    transportFareBankAccount,
  );

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
  await labourService.reverseLabourPayable(sale.labour, {
    when,
    refType: REF.SALE,
    refNo: sale.number,
    store: sale.store,
    actor,
    label: 'sale',
  });
  // Uses the sale's still-original `transporter`/fare fields — they aren't
  // overwritten until the field-assignment block below.
  await reverseTransportFareExpense(sale, actor);

  sale.items = lineItems;
  sale.labour = saleLabour;
  sale.transport = {
    driverName: (transport.driverName ?? sale.transport?.driverName ?? '').trim(),
    driverPhone: (transport.driverPhone ?? sale.transport?.driverPhone ?? '').trim(),
    vehicleNumber: (transport.vehicleNumber ?? sale.transport?.vehicleNumber ?? '').trim(),
  };
  sale.warehouse = wh._id;
  sale.transporter = transporterDoc ? transporterDoc._id : null;
  sale.transportFareMethod =
    transportFareResolved && transportFareResolved.settle ? transportFareMethod : null;
  sale.transportFareBankAccount =
    transportFareResolved && transportFareResolved.settle ? transportFareResolved.settle.ref : null;
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

  await labourService.postLabourPayable(sale.labour, {
    when,
    refType: REF.SALE,
    refNo: sale.number,
    store: sale.store,
    actor,
    label: 'sale',
  });
  await postTransportFareExpense(sale, transportFareResolved, actor);

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

  if (sale.transporter) await sale.populate('transporter', 'name phone vehicleNumber');
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
  const settle = await paymentService.settlementAccount(method, bankAccount, sale.store);
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
  vendor,
  labour,
  transporter,
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
  if (vendor) filter['items.vendor'] = vendor;
  if (labour) filter['labour.labour'] = labour;
  if (transporter) filter.transporter = transporter;
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
      .populate('store', 'name code address')
      .populate('transporter', 'name phone vehicleNumber')
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
    .populate('store', 'name code address')
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
