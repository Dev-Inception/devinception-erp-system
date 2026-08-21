const mongoose = require('mongoose');
const StockReceipt = require('../models/stockReceiptModel');
const Supplier = require('../models/supplierModel');
const Transporter = require('../models/transporterModel');
const Warehouse = require('../models/warehouseModel');
const Store = require('../models/storeModel');
const Product = require('../models/productModel');
const ApiError = require('../utils/ApiError');
const { ACCOUNT, REF } = require('../utils/finance');
const journalService = require('./journalService');
const stockService = require('./stockService');
const counterService = require('./counterService');
const gatePassService = require('./gatePassService');
const GatePass = require('../models/gatePassModel');
const pendingEntityService = require('./pendingEntityService');
const paymentService = require('./paymentService');
const labourService = require('./labourService');
const { toPaisa } = require('../utils/money');
const { normalizeQuantity } = require('../utils/quantity');
const { parsePagination, escapeRegex } = require('../utils/query');
const {
  resolveWarehouseScope,
  warehouseMongoFilter,
  actorStoreId,
  assertStoreAccess,
} = require('../utils/storeScope');

// Looks up an optional Transporter reference — a receipt is free to have
// none at all (the free-text truck.driverName/driverPhone still works
// standalone), but if an id is given it must resolve to a real transporter.
async function resolveTransporter(transporterId) {
  if (!transporterId) return null;
  const transporter = await Transporter.findById(transporterId);
  if (!transporter) throw ApiError.notFound('Transporter not found');
  return transporter;
}

// Resolves and validates the truck-fare settlement up front — before
// anything else is committed — so an insufficient-funds problem rejects the
// whole receipt rather than leaving stock/inventory half-applied. Returns
// null when there's nothing for us to pay (covered by the supplier, or no
// fare at all). When a transporter is attached, a payment method is no
// longer mandatory for 'US' — omitting it just means the fare is owed to
// that transporter rather than settled now (see postTruckFareExpense).
async function resolveTruckFarePayment(
  truckFare,
  truckFarePaidBy,
  truckFareMethod,
  bankAccount,
  transporterId,
) {
  const amount = toPaisa(truckFare || 0);
  if (truckFarePaidBy !== 'US' || amount <= 0) return null;
  if (!truckFareMethod) {
    if (transporterId) return { amount, settle: null };
    throw ApiError.badRequest('A payment method is required when we pay the truck fare');
  }
  const settle = await paymentService.settlementAccount(truckFareMethod, bankAccount);
  await paymentService.assertSufficientFunds(settle.account, settle.ref, amount);
  return { amount, settle };
}

// Posts the truck-fare operating expense. With no transporter attached this
// is the original single entry: Dr Operating Expense / Cr Cash|Bank. With a
// transporter attached, the charge always posts against their own ledger
// (Dr Operating Expense / Cr AP_TRANSPORT[ref=transporter]) so their
// statement shows the job even when paid immediately; a settlement
// (Dr AP_TRANSPORT[ref] / Cr Cash|Bank) is posted alongside only when
// `resolved.settle` is present (a method was actually given).
async function postTruckFareExpense(receipt, resolved, actor) {
  if (!resolved) return;
  const base = {
    date: receipt.date,
    refType: REF.EXPENSE,
    refId: receipt._id,
    refNo: receipt.number,
    warehouse: receipt.warehouse,
    store: receipt.store,
    createdBy: actor ? actor._id : null,
  };
  if (receipt.transporter) {
    await journalService.post({
      ...base,
      description: `Truck fare charged to transporter for receipt ${receipt.number}`,
      lines: [
        journalService.line(ACCOUNT.OPERATING_EXPENSE, { debit: resolved.amount }),
        journalService.line(ACCOUNT.AP_TRANSPORT, {
          credit: resolved.amount,
          ref: receipt.transporter,
        }),
      ],
    });
    if (resolved.settle) {
      await journalService.post({
        ...base,
        refType: REF.PAYMENT,
        description: `Truck fare paid to transporter for receipt ${receipt.number}`,
        lines: [
          journalService.line(ACCOUNT.AP_TRANSPORT, {
            debit: resolved.amount,
            ref: receipt.transporter,
          }),
          journalService.line(resolved.settle.account, {
            credit: resolved.amount,
            ref: resolved.settle.ref,
          }),
        ],
      });
    }
    return;
  }
  await journalService.post({
    ...base,
    description: `Truck fare for receipt ${receipt.number}`,
    lines: [
      journalService.line(ACCOUNT.OPERATING_EXPENSE, { debit: resolved.amount }),
      journalService.line(resolved.settle.account, {
        credit: resolved.amount,
        ref: resolved.settle.ref,
      }),
    ],
  });
}

// Reverses a previously-posted truck-fare expense (mirror entry(ies)), using
// the receipt's own stored fields — called before an edit/delete changes or
// removes it. No sufficient-funds check needed: this only ever credits cash
// back in (or reduces a transporter's AP_TRANSPORT balance back down).
async function reverseTruckFareExpense(receipt, actor) {
  if (receipt.truckFarePaidBy !== 'US' || !receipt.truckFare) return;
  const base = {
    date: new Date(),
    refType: REF.EXPENSE,
    refId: receipt._id,
    refNo: receipt.number,
    warehouse: receipt.warehouse,
    store: receipt.store,
    createdBy: actor ? actor._id : null,
  };
  if (receipt.transporter) {
    await journalService.post({
      ...base,
      description: `Reversal of truck fare charge for receipt ${receipt.number}`,
      lines: [
        journalService.line(ACCOUNT.AP_TRANSPORT, {
          debit: receipt.truckFare,
          ref: receipt.transporter,
        }),
        journalService.line(ACCOUNT.OPERATING_EXPENSE, { credit: receipt.truckFare }),
      ],
    });
    if (receipt.truckFareMethod) {
      const settle = await paymentService.settlementAccount(
        receipt.truckFareMethod,
        receipt.truckFareBankAccount,
      );
      await journalService.post({
        ...base,
        refType: REF.PAYMENT,
        description: `Reversal of truck fare payment for receipt ${receipt.number}`,
        lines: [
          journalService.line(settle.account, { debit: receipt.truckFare, ref: settle.ref }),
          journalService.line(ACCOUNT.AP_TRANSPORT, {
            credit: receipt.truckFare,
            ref: receipt.transporter,
          }),
        ],
      });
    }
    return;
  }
  const settle = await paymentService.settlementAccount(
    receipt.truckFareMethod,
    receipt.truckFareBankAccount,
  );
  await journalService.post({
    ...base,
    description: `Reversal of truck fare for receipt ${receipt.number}`,
    lines: [
      journalService.line(settle.account, { debit: receipt.truckFare, ref: settle.ref }),
      journalService.line(ACCOUNT.OPERATING_EXPENSE, { credit: receipt.truckFare }),
    ],
  });
}

/**
 * Records a truck delivery from a supplier: one document per truck, with a
 * line per product covering both the good quantity received (added to
 * stock at the catalog purchase price) and the damaged quantity (recorded
 * for tracking only — damaged goods are written off on arrival and never
 * enter sellable stock, so they carry no stock/ledger effect).
 */
async function createReceipt(
  actor,
  {
    supplier,
    store,
    warehouse,
    date,
    truck,
    items,
    note,
    truckFare,
    truckFarePaidBy = 'SUPPLIER',
    truckFareMethod,
    truckFareBankAccount,
    transporter,
    labour = [],
  },
) {
  const supplierDoc = await Supplier.findById(supplier);
  if (!supplierDoc) throw ApiError.notFound('Supplier not found');
  // Every delivery is received for one physical storefront — required so
  // it's permanently on record which shop this stock was brought in for.
  const storeDoc = await Store.findById(store);
  if (!storeDoc) throw ApiError.badRequest('A store is required');
  assertStoreAccess(actor, storeDoc._id);
  const warehouseDoc = await Warehouse.findById(warehouse);
  if (!warehouseDoc) throw ApiError.notFound('Warehouse not found');
  if (!truck || !truck.vehicleNumber) {
    throw ApiError.badRequest('Truck vehicle number is required');
  }
  if (!Array.isArray(items) || items.length === 0) {
    throw ApiError.badRequest('At least one product line is required');
  }
  const receiptLabour = await labourService.resolveLabourLines(labour);
  const labourRentPaisa = receiptLabour.reduce((s, l) => s + l.rent, 0);
  const transporterDoc = await resolveTransporter(transporter);
  // Validated (and funds checked) up front, before any stock/inventory is
  // touched — an insufficient-funds problem should reject the whole receipt,
  // not leave it half-applied.
  const truckFareResolved = await resolveTruckFarePayment(
    truckFare,
    truckFarePaidBy,
    truckFareMethod,
    truckFareBankAccount,
    transporterDoc && transporterDoc._id,
  );

  const products = await Product.find({ _id: { $in: items.map((it) => it.product) } });
  const productsById = new Map(products.map((p) => [String(p._id), p]));

  const lines = [];
  for (const it of items) {
    const product = productsById.get(String(it.product));
    if (!product) throw ApiError.badRequest(`Product ${it.product} not found`);
    const receivedQuantity = normalizeQuantity(it.receivedQuantity || 0);
    const damagedQuantity = normalizeQuantity(it.damagedQuantity || 0);
    if (receivedQuantity <= 0 && damagedQuantity <= 0) {
      throw ApiError.badRequest(`${product.name}: enter a received or damaged quantity`);
    }
    lines.push({ product, receivedQuantity, damagedQuantity });
  }

  const when = date ? new Date(date) : new Date();
  const number = await counterService.nextDocNumber('GRN', when.getFullYear(), 6);

  // Only the received-good quantity ever becomes stock; damaged units are
  // written off on arrival and are recorded on the receipt for tracking only.
  let totalReceivedValue = 0;
  for (const line of lines) {
    if (line.receivedQuantity <= 0) continue;
    totalReceivedValue += await stockService.receiveStock(
      line.product._id,
      warehouseDoc._id,
      line.receivedQuantity,
      line.product.purchasePrice || 0,
      { refType: 'PURCHASE', refNo: number, date: when },
    );
  }

  const receipt = await StockReceipt.create({
    number,
    supplier: supplierDoc._id,
    supplierName: supplierDoc.name,
    store: storeDoc._id,
    warehouse: warehouseDoc._id,
    date: when,
    truck: {
      vehicleNumber: truck.vehicleNumber,
      driverName: truck.driverName || '',
      driverPhone: truck.driverPhone || '',
    },
    items: lines.map((l) => ({
      product: l.product._id,
      name: l.product.name,
      receivedQuantity: l.receivedQuantity,
      damagedQuantity: l.damagedQuantity,
    })),
    transporter: transporterDoc ? transporterDoc._id : null,
    truckFare: truckFareResolved ? truckFareResolved.amount : toPaisa(truckFare || 0),
    truckFarePaidBy,
    truckFareMethod: truckFareResolved && truckFareResolved.settle ? truckFareMethod : null,
    truckFareBankAccount:
      truckFareResolved && truckFareResolved.settle ? truckFareResolved.settle.ref : null,
    labour: receiptLabour,
    labourRent: labourRentPaisa,
    note: (note || '').trim(),
    createdBy: actor ? actor._id : null,
  });

  if (totalReceivedValue > 0) {
    await journalService.post({
      date: when,
      description: `Stock receipt ${number} from ${supplierDoc.name}`,
      refType: REF.PURCHASE,
      refId: receipt._id,
      refNo: number,
      warehouse: warehouseDoc._id,
      store: storeDoc._id,
      createdBy: actor ? actor._id : null,
      lines: [
        journalService.line(ACCOUNT.INVENTORY, { debit: totalReceivedValue }),
        journalService.line(ACCOUNT.EQUITY, { credit: totalReceivedValue }),
      ],
    });
  }

  await postTruckFareExpense(receipt, truckFareResolved, actor);

  // Labour payable: Dr Operating Expense / Cr AP_LABOUR per labourer with a
  // rent — same treatment as a sale's labour charge (see labourService).
  await labourService.postLabourPayable(receiptLabour, {
    when,
    refType: REF.PURCHASE,
    refNo: number,
    store: storeDoc._id,
    actor,
    label: 'stock receipt',
  });

  // Every received line becomes a Pending Entity — the supplier hasn't
  // actually gone payable for this delivery yet (see pendingEntityService).
  // Not fatal: the receipt and its stock addition are already committed.
  try {
    await pendingEntityService.recordStockReceiptItems(
      receipt,
      lines.filter((l) => l.receivedQuantity > 0),
      actor,
    );
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error(`Pending entity creation failed for stock receipt ${number}:`, error);
  }

  // "Goods coming in" gate pass — how much of each product actually entered
  // the warehouse on this truck.
  const gatePass = await gatePassService.createForReceipt(receipt);
  if (gatePass) {
    receipt.gatePass = gatePass._id;
    await receipt.save();
  }

  if (receipt.transporter) await receipt.populate('transporter', 'name phone vehicleNumber');
  return receipt;
}

// Undoes a receipt's stock addition, one line at a time, by issuing the
// received quantity back out at the current moving-average cost — the same
// costing basis a normal issue uses, since the original cost layer can't be
// isolated once other movements have blended into the average. Returns the
// total inventory value removed, for the balancing journal reversal. Fails
// (blocking the edit/delete) if any of that stock has since been sold below
// the received quantity.
async function reverseReceiptStock(receipt, actor) {
  let reversedValue = 0;
  for (const it of receipt.items) {
    if (it.receivedQuantity <= 0) continue;
    try {
      reversedValue += await stockService.issueStock(
        it.product,
        receipt.warehouse,
        it.receivedQuantity,
        { refType: 'PURCHASE', refNo: receipt.number, date: new Date() },
      );
    } catch {
      throw ApiError.badRequest(
        `Cannot modify this receipt: stock received for ${it.name} has already been used`,
      );
    }
  }
  if (reversedValue > 0) {
    await journalService.post({
      date: new Date(),
      description: `Reversal for stock receipt ${receipt.number}`,
      refType: REF.PURCHASE,
      refId: receipt._id,
      refNo: receipt.number,
      warehouse: receipt.warehouse,
      store: receipt.store,
      createdBy: actor ? actor._id : null,
      lines: [
        journalService.line(ACCOUNT.EQUITY, { debit: reversedValue }),
        journalService.line(ACCOUNT.INVENTORY, { credit: reversedValue }),
      ],
    });
  }
  return reversedValue;
}

/**
 * Full receipt edit — reverses the original stock addition and its journal
 * entry, then re-validates and re-applies the revised lines exactly like
 * createReceipt. Blocked once any of the originally received stock has
 * already been sold (see reverseReceiptStock).
 */
async function updateReceipt(
  actor,
  id,
  {
    supplier,
    warehouse,
    date,
    truck,
    items,
    note,
    truckFare,
    truckFarePaidBy = 'SUPPLIER',
    truckFareMethod,
    truckFareBankAccount,
    transporter,
    labour = [],
  },
) {
  const receipt = await StockReceipt.findById(id);
  if (!receipt) throw ApiError.notFound('Stock receipt not found');
  assertStoreAccess(actor, receipt.store);

  const supplierDoc = await Supplier.findById(supplier);
  if (!supplierDoc) throw ApiError.notFound('Supplier not found');
  const warehouseDoc = await Warehouse.findById(warehouse);
  if (!warehouseDoc) throw ApiError.notFound('Warehouse not found');
  if (!truck || !truck.vehicleNumber) {
    throw ApiError.badRequest('Truck vehicle number is required');
  }
  if (!Array.isArray(items) || items.length === 0) {
    throw ApiError.badRequest('At least one product line is required');
  }

  const products = await Product.find({ _id: { $in: items.map((it) => it.product) } });
  const productsById = new Map(products.map((p) => [String(p._id), p]));

  const lines = [];
  for (const it of items) {
    const product = productsById.get(String(it.product));
    if (!product) throw ApiError.badRequest(`Product ${it.product} not found`);
    const receivedQuantity = normalizeQuantity(it.receivedQuantity || 0);
    const damagedQuantity = normalizeQuantity(it.damagedQuantity || 0);
    if (receivedQuantity <= 0 && damagedQuantity <= 0) {
      throw ApiError.badRequest(`${product.name}: enter a received or damaged quantity`);
    }
    lines.push({ product, receivedQuantity, damagedQuantity });
  }

  const transporterDoc = await resolveTransporter(transporter);

  await reverseReceiptStock(receipt, actor);
  // Reverse the original truck fare expense (if any) before re-resolving the
  // revised one below, so the funds check sees the true post-reversal balance.
  // Uses the receipt's still-original `transporter`/fare fields — they
  // aren't overwritten until after this call.
  await reverseTruckFareExpense(receipt, actor);
  const truckFareResolved = await resolveTruckFarePayment(
    truckFare,
    truckFarePaidBy,
    truckFareMethod,
    truckFareBankAccount,
    transporterDoc && transporterDoc._id,
  );
  await labourService.reverseLabourPayable(receipt.labour, {
    when: new Date(),
    refType: REF.PURCHASE,
    refNo: receipt.number,
    store: receipt.store,
    actor,
    label: 'stock receipt',
  });
  const receiptLabour = await labourService.resolveLabourLines(labour);
  const labourRentPaisa = receiptLabour.reduce((s, l) => s + l.rent, 0);

  const when = date ? new Date(date) : receipt.date;

  let totalReceivedValue = 0;
  for (const line of lines) {
    if (line.receivedQuantity <= 0) continue;
    totalReceivedValue += await stockService.receiveStock(
      line.product._id,
      warehouseDoc._id,
      line.receivedQuantity,
      line.product.purchasePrice || 0,
      { refType: 'PURCHASE', refNo: receipt.number, date: when },
    );
  }

  receipt.supplier = supplierDoc._id;
  receipt.supplierName = supplierDoc.name;
  receipt.warehouse = warehouseDoc._id;
  receipt.date = when;
  receipt.truck = {
    vehicleNumber: truck.vehicleNumber,
    driverName: truck.driverName || '',
    driverPhone: truck.driverPhone || '',
  };
  receipt.items = lines.map((l) => ({
    product: l.product._id,
    name: l.product.name,
    receivedQuantity: l.receivedQuantity,
    damagedQuantity: l.damagedQuantity,
  }));
  receipt.transporter = transporterDoc ? transporterDoc._id : null;
  receipt.truckFare = truckFareResolved ? truckFareResolved.amount : toPaisa(truckFare || 0);
  receipt.truckFarePaidBy = truckFarePaidBy;
  receipt.truckFareMethod = truckFareResolved && truckFareResolved.settle ? truckFareMethod : null;
  receipt.truckFareBankAccount =
    truckFareResolved && truckFareResolved.settle ? truckFareResolved.settle.ref : null;
  receipt.labour = receiptLabour;
  receipt.labourRent = labourRentPaisa;
  receipt.note = (note || '').trim();
  await receipt.save();

  if (totalReceivedValue > 0) {
    await journalService.post({
      date: when,
      description: `Revised stock receipt ${receipt.number} from ${supplierDoc.name}`,
      refType: REF.PURCHASE,
      refId: receipt._id,
      refNo: receipt.number,
      warehouse: receipt.warehouse,
      store: receipt.store,
      createdBy: actor ? actor._id : null,
      lines: [
        journalService.line(ACCOUNT.INVENTORY, { debit: totalReceivedValue }),
        journalService.line(ACCOUNT.EQUITY, { credit: totalReceivedValue }),
      ],
    });
  }

  await postTruckFareExpense(receipt, truckFareResolved, actor);

  await labourService.postLabourPayable(receiptLabour, {
    when,
    refType: REF.PURCHASE,
    refNo: receipt.number,
    store: receipt.store,
    actor,
    label: 'stock receipt',
  });

  // Re-snapshot the gate pass for the revised quantities/warehouse.
  const gatePass = await gatePassService.createForReceipt(receipt);
  const gatePassId = gatePass ? gatePass._id : null;
  if (String(receipt.gatePass || '') !== String(gatePassId || '')) {
    receipt.gatePass = gatePassId;
    await receipt.save();
  }

  if (receipt.transporter) await receipt.populate('transporter', 'name phone vehicleNumber');
  return receipt;
}

/**
 * Deletes a receipt after reversing its stock addition and the matching
 * journal entry (see reverseReceiptStock). Blocked once any of the
 * originally received stock has already been sold.
 */
async function deleteReceipt(actor, id) {
  const receipt = await StockReceipt.findById(id);
  if (!receipt) throw ApiError.notFound('Stock receipt not found');
  assertStoreAccess(actor, receipt.store);

  await reverseReceiptStock(receipt, actor);
  await reverseTruckFareExpense(receipt, actor);
  await labourService.reverseLabourPayable(receipt.labour, {
    when: new Date(),
    refType: REF.PURCHASE,
    refNo: receipt.number,
    store: receipt.store,
    actor,
    label: 'stock receipt',
  });
  // Its gate pass no longer documents a real delivery once the receipt (and
  // the stock it added) is gone.
  await GatePass.deleteOne({ sourceType: 'PURCHASE', stockReceipt: receipt._id });
  await receipt.deleteOne();
  return receipt;
}

/**
 * Records a payment to the supplier against this specific receipt's priced
 * items (Pending Entities that have already been given a purchase price —
 * see pendingEntityService.setPurchasePrice). Mirrors saleService.recordPayment
 * but in the opposite direction: Dr AP_SUPPLIER(supplier) / Cr Cash|Bank,
 * since this is paying down a payable rather than collecting a receivable.
 */
async function recordPayment(actor, id, { amount, method, bankAccount, note }) {
  const receipt = await StockReceipt.findById(id);
  if (!receipt) throw ApiError.notFound('Stock receipt not found');
  assertStoreAccess(actor, receipt.store);

  const amt = toPaisa(amount);
  if (amt <= 0) throw ApiError.badRequest('Amount must be positive');

  const totals = await pendingEntityService.pricedTotalsByStockReceipt([receipt._id]);
  const pricedTotal = totals.get(String(receipt._id)) || 0;
  const remaining = Math.max(0, pricedTotal - receipt.additionalPaidAmount);
  if (amt > remaining) {
    throw ApiError.badRequest('Amount exceeds the remaining balance owed on this receipt');
  }

  const settle = await paymentService.settlementAccount(method, bankAccount);
  await paymentService.assertSufficientFunds(settle.account, settle.ref, amt);
  const when = new Date();

  await journalService.post({
    date: when,
    description: note || `Payment to ${receipt.supplierName} for receipt ${receipt.number}`,
    refType: REF.PURCHASE,
    refId: receipt._id,
    refNo: receipt.number,
    warehouse: receipt.warehouse,
    store: receipt.store,
    createdBy: actor ? actor._id : null,
    lines: [
      journalService.line(ACCOUNT.AP_SUPPLIER, { debit: amt, ref: receipt.supplier }),
      journalService.line(settle.account, { credit: amt, ref: settle.ref }),
    ],
  });

  receipt.additionalPaidAmount += amt;
  await receipt.save();
  return receipt;
}

async function listReceipts({
  supplier,
  labour,
  transporter,
  warehouse,
  store,
  from,
  to,
  search,
  actor,
  ...query
} = {}) {
  const { page, limit, skip } = parsePagination(query);
  const filter = {};
  if (supplier) filter.supplier = supplier;
  if (labour) filter['labour.labour'] = labour;
  if (transporter) filter.transporter = transporter;
  // Every receipt now records its own storefront directly — filter on that
  // rather than the indirect (and looser) warehouse-membership scoping.
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
  if (search) {
    const re = new RegExp(escapeRegex(search), 'i');
    filter.$or = [{ number: re }, { supplierName: re }, { 'truck.vehicleNumber': re }];
  }

  const [receipts, total] = await Promise.all([
    StockReceipt.find(filter)
      .populate('warehouse', 'name')
      .populate('store', 'name code')
      .populate('transporter', 'name phone vehicleNumber')
      .sort({ date: -1, createdAt: -1 })
      .skip(skip)
      .limit(limit),
    StockReceipt.countDocuments(filter),
  ]);

  return { receipts, total, page, limit };
}

module.exports = { createReceipt, updateReceipt, deleteReceipt, listReceipts, recordPayment };
