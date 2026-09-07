const { Op } = require('sequelize');
const { getPostgres } = require('../db/postgres');
const { initializeModels } = require('../db/models');
const { isValidId } = require('../db/id');
const ApiError = require('../utils/ApiError');
const { ACCOUNT, REF } = require('../utils/finance');
const journalService = require('./journalService');
const stockService = require('./stockService');
const counterService = require('./counterService');
const gatePassService = require('./gatePassService');
const pendingEntityService = require('./pendingEntityService');
const paymentService = require('./paymentService');
const labourService = require('./labourService');
const { toPaisa } = require('../utils/money');
const { normalizeQuantity } = require('../utils/quantity');
const { parsePagination, escapeLike } = require('../utils/query');
const {
  resolveWarehouseScope,
  warehouseWhere,
  actorStoreId,
  assertStoreAccess,
} = require('../utils/storeScope');

/**
 * Records a truck delivery from a supplier: one document per truck, with a
 * line per product covering both the good quantity received (added to
 * stock at the catalog purchase price) and the damaged quantity (recorded
 * for tracking only — damaged goods are written off on arrival and never
 * enter sellable stock, so they carry no stock/ledger effect).
 *
 * Every write below — stock, the receipt + line rows, journal entries,
 * truck-fare/labour payables, pending-entity creation, and gate-pass
 * creation — runs inside one transaction, so a failure anywhere rolls back
 * the whole receipt.
 */

// Looks up an optional Transporter reference — a receipt is free to have
// none at all (the free-text truck.driverName/driverPhone still works
// standalone), but if an id is given it must resolve to a real transporter.
async function resolveTransporter(transporterId, transaction) {
  if (!transporterId) return null;
  const { Transporter } = initializeModels();
  const transporter = await Transporter.findByPk(transporterId, { transaction });
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
  transaction,
) {
  const amount = toPaisa(truckFare || 0);
  if (truckFarePaidBy !== 'US' || amount <= 0) return null;
  if (!truckFareMethod) {
    if (transporterId) return { amount, settle: null };
    throw ApiError.badRequest('A payment method is required when we pay the truck fare');
  }
  const settle = await paymentService.settlementAccount(
    truckFareMethod,
    bankAccount,
    undefined,
    transaction,
  );
  await paymentService.assertSufficientFunds(settle.account, settle.ref, amount, transaction);
  return { amount, settle };
}

// Posts the truck-fare operating expense. With no transporter attached this
// is the original single entry: Dr Operating Expense / Cr Cash|Bank. With a
// transporter attached, the charge always posts against their own ledger
// (Dr Operating Expense / Cr AP_TRANSPORT[ref=transporter]) so their
// statement shows the job even when paid immediately; a settlement
// (Dr AP_TRANSPORT[ref] / Cr Cash|Bank) is posted alongside only when
// `resolved.settle` is present (a method was actually given).
async function postTruckFareExpense(receipt, resolved, actor, transaction) {
  if (!resolved) return;
  const base = {
    date: receipt.date,
    refType: REF.EXPENSE,
    refId: receipt.id,
    refNo: receipt.number,
    warehouse: receipt.warehouse,
    store: receipt.store,
    createdBy: actor ? actor.id : null,
    transaction,
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
async function reverseTruckFareExpense(receipt, actor, transaction) {
  if (receipt.truckFarePaidBy !== 'US' || !receipt.truckFare) return;
  const base = {
    date: new Date(),
    refType: REF.EXPENSE,
    refId: receipt.id,
    refNo: receipt.number,
    warehouse: receipt.warehouse,
    store: receipt.store,
    createdBy: actor ? actor.id : null,
    transaction,
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
        undefined,
        transaction,
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
    undefined,
    transaction,
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

async function reloadWithAssociations(id, transaction) {
  const { StockReceipt, StockReceiptItem, StockReceiptLabour, Warehouse, Store, Transporter } =
    initializeModels();
  return StockReceipt.findByPk(id, {
    include: [
      { model: StockReceiptItem, as: 'items', separate: true, order: [['position', 'ASC']] },
      { model: StockReceiptLabour, as: 'labour', separate: true, order: [['position', 'ASC']] },
      { model: Warehouse, as: 'warehouseInfo', attributes: ['id', 'name'] },
      { model: Store, as: 'storeInfo', attributes: ['id', 'name', 'code'] },
      {
        model: Transporter,
        as: 'transporterInfo',
        attributes: ['id', 'name', 'phone', 'vehicleNumber'],
      },
    ],
    transaction,
  });
}

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
    isOpeningStock = false,
  },
) {
  return getPostgres().transaction(async (transaction) => {
    const { StockReceipt, StockReceiptItem, Supplier, Store, Warehouse, Product } =
      initializeModels();

    const supplierDoc = await Supplier.findByPk(supplier, { transaction });
    if (!supplierDoc) throw ApiError.notFound('Supplier not found');
    // Every delivery is received for one physical storefront — required so
    // it's permanently on record which shop this stock was brought in for.
    const storeDoc = await Store.findByPk(store, { transaction });
    if (!storeDoc) throw ApiError.badRequest('A store is required');
    assertStoreAccess(actor, storeDoc.id);
    const warehouseDoc = await Warehouse.findByPk(warehouse, { transaction });
    if (!warehouseDoc) throw ApiError.notFound('Warehouse not found');
    // Opening-stock entries (already-in-warehouse stock, no truck) skip the
    // truck requirement entirely — see isOpeningStock on the model.
    if (!isOpeningStock && (!truck || !truck.vehicleNumber)) {
      throw ApiError.badRequest('Truck vehicle number is required');
    }
    if (!Array.isArray(items) || items.length === 0) {
      throw ApiError.badRequest('At least one product line is required');
    }
    const receiptLabour = await labourService.resolveLabourLines(labour, transaction);
    const labourRentPaisa = receiptLabour.reduce((s, l) => s + l.rent, 0);
    const transporterDoc = await resolveTransporter(transporter, transaction);
    // Validated (and funds checked) up front, before any stock/inventory is
    // touched — an insufficient-funds problem should reject the whole
    // receipt, not leave it half-applied.
    const truckFareResolved = await resolveTruckFarePayment(
      truckFare,
      truckFarePaidBy,
      truckFareMethod,
      truckFareBankAccount,
      transporterDoc && transporterDoc.id,
      transaction,
    );

    const products = await Product.findAll({
      where: { id: items.map((it) => it.product) },
      transaction,
    });
    const productsById = new Map(products.map((p) => [String(p.id), p]));

    const lines = [];
    for (const it of items) {
      const product = productsById.get(String(it.product));
      if (!product) throw ApiError.badRequest(`Product ${it.product} not found`);
      const receivedQuantity = normalizeQuantity(it.receivedQuantity || 0);
      const damagedQuantity = normalizeQuantity(it.damagedQuantity || 0);
      if (receivedQuantity <= 0 && damagedQuantity <= 0) {
        throw ApiError.badRequest(`${product.name}: enter a received or damaged quantity`);
      }
      // Opening-stock only — a known cost, priced immediately below instead
      // of left as an unpriced Pending Entity.
      const unitCost = isOpeningStock && Number(it.unitCost) > 0 ? Number(it.unitCost) : 0;
      lines.push({ product, receivedQuantity, damagedQuantity, unitCost });
    }

    const when = date ? new Date(date) : new Date();
    // Opening-stock entries get their own OPN- numbering series so they read
    // as distinct from a real truck delivery (GRN-) in reports/search.
    const number = await counterService.nextDocNumber(
      isOpeningStock ? 'OPN' : 'GRN',
      when.getFullYear(),
      6,
      transaction,
    );

    // Only the received-good quantity ever becomes stock; damaged units are
    // written off on arrival and are recorded on the receipt for tracking only.
    let totalReceivedValue = 0;
    for (const line of lines) {
      if (line.receivedQuantity <= 0) continue;
      totalReceivedValue += await stockService.receiveStock(
        line.product.id,
        warehouseDoc.id,
        line.receivedQuantity,
        line.product.purchasePrice || 0,
        { refType: 'PURCHASE', refNo: number, date: when },
        null,
        transaction,
      );
    }

    const receipt = await StockReceipt.create(
      {
        number,
        supplier: supplierDoc.id,
        supplierName: supplierDoc.name,
        store: storeDoc.id,
        warehouse: warehouseDoc.id,
        date: when,
        isOpeningStock,
        truckVehicleNumber: (truck && truck.vehicleNumber) || '',
        truckDriverName: (truck && truck.driverName) || '',
        truckDriverPhone: (truck && truck.driverPhone) || '',
        transporter: transporterDoc ? transporterDoc.id : null,
        truckFare: truckFareResolved ? truckFareResolved.amount : toPaisa(truckFare || 0),
        truckFarePaidBy,
        truckFareMethod: truckFareResolved && truckFareResolved.settle ? truckFareMethod : null,
        truckFareBankAccount:
          truckFareResolved && truckFareResolved.settle ? truckFareResolved.settle.ref : null,
        labourRent: labourRentPaisa,
        note: (note || '').trim(),
        createdBy: actor ? actor.id : null,
      },
      { transaction },
    );
    await StockReceiptItem.bulkCreate(
      lines.map((l, position) => ({
        stockReceiptId: receipt.id,
        position,
        product: l.product.id,
        name: l.product.name,
        receivedQuantity: l.receivedQuantity,
        damagedQuantity: l.damagedQuantity,
      })),
      { transaction },
    );
    const { StockReceiptLabour } = initializeModels();
    await StockReceiptLabour.bulkCreate(
      receiptLabour.map((l, position) => ({ stockReceiptId: receipt.id, position, ...l })),
      { transaction },
    );

    if (totalReceivedValue > 0) {
      await journalService.post({
        date: when,
        description: isOpeningStock
          ? `Opening stock ${number} from ${supplierDoc.name}`
          : `Stock receipt ${number} from ${supplierDoc.name}`,
        refType: REF.PURCHASE,
        refId: receipt.id,
        refNo: number,
        warehouse: warehouseDoc.id,
        store: storeDoc.id,
        createdBy: actor ? actor.id : null,
        transaction,
        lines: [
          journalService.line(ACCOUNT.INVENTORY, { debit: totalReceivedValue }),
          journalService.line(ACCOUNT.EQUITY, { credit: totalReceivedValue }),
        ],
      });
    }

    await postTruckFareExpense(receipt, truckFareResolved, actor, transaction);

    // Labour payable: Dr Operating Expense / Cr AP_LABOUR per labourer with a
    // rent — same treatment as a sale's labour charge (see labourService).
    await labourService.postLabourPayable(receiptLabour, {
      when,
      refType: REF.PURCHASE,
      refNo: number,
      store: storeDoc.id,
      actor,
      label: 'stock receipt',
      transaction,
    });

    // Every received line becomes a Pending Entity — the supplier hasn't
    // actually gone payable for this delivery yet (see pendingEntityService).
    const receivedLines = lines.filter((l) => l.receivedQuantity > 0);
    const pendingEntities = await pendingEntityService.recordStockReceiptItems(
      receipt,
      receivedLines,
      actor,
      transaction,
    );
    // Opening stock only: a line given a known unit cost is priced right
    // away — the supplier debt for it is real today, not deferred pricing
    // (see pendingEntityService.setPurchasePrice). Lines left without a cost
    // stay PENDING, same as a normal delivery.
    if (isOpeningStock) {
      for (let i = 0; i < pendingEntities.length; i += 1) {
        if (receivedLines[i].unitCost > 0) {
          await pendingEntityService.setPurchasePrice(
            actor,
            pendingEntities[i].id,
            receivedLines[i].unitCost,
          );
        }
      }
    }

    // "Goods coming in" gate pass — how much of each product actually
    // entered the warehouse on this truck. Doesn't apply to opening stock:
    // there's no truck at the gate for stock that was already in the warehouse.
    if (!isOpeningStock) {
      receipt.items = lines.map((l) => ({
        product: l.product.id,
        name: l.product.name,
        receivedQuantity: l.receivedQuantity,
      }));
      const gatePass = await gatePassService.createForReceipt(receipt, transaction);
      if (gatePass) {
        receipt.gatePass = gatePass.id;
        await receipt.save({ transaction });
      }
    }

    return reloadWithAssociations(receipt.id, transaction);
  });
}

// Undoes a receipt's stock addition, one line at a time, by issuing the
// received quantity back out at the current moving-average cost — the same
// costing basis a normal issue uses, since the original cost layer can't be
// isolated once other movements have blended into the average. Returns the
// total inventory value removed, for the balancing journal reversal. Fails
// (blocking the edit/delete) if any of that stock has since been sold below
// the received quantity.
async function reverseReceiptStock(receipt, actor, transaction) {
  let reversedValue = 0;
  for (const it of receipt.items) {
    if (it.receivedQuantity <= 0) continue;
    try {
      reversedValue += await stockService.issueStock(
        it.product,
        receipt.warehouse,
        it.receivedQuantity,
        { refType: 'PURCHASE', refNo: receipt.number, date: new Date() },
        transaction,
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
      refId: receipt.id,
      refNo: receipt.number,
      warehouse: receipt.warehouse,
      store: receipt.store,
      createdBy: actor ? actor.id : null,
      transaction,
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
  return getPostgres().transaction(async (transaction) => {
    const { StockReceipt, StockReceiptItem, StockReceiptLabour, Supplier, Warehouse, Product } =
      initializeModels();

    const receipt = await StockReceipt.findByPk(id, {
      include: [
        { model: StockReceiptItem, as: 'items', separate: true },
        { model: StockReceiptLabour, as: 'labour', separate: true },
      ],
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!receipt) throw ApiError.notFound('Stock receipt not found');
    assertStoreAccess(actor, receipt.store);

    const supplierDoc = await Supplier.findByPk(supplier, { transaction });
    if (!supplierDoc) throw ApiError.notFound('Supplier not found');
    const warehouseDoc = await Warehouse.findByPk(warehouse, { transaction });
    if (!warehouseDoc) throw ApiError.notFound('Warehouse not found');
    // Whether a receipt is opening stock is fixed at creation (see the
    // model) — an edit can't flip it, so this is read from the existing
    // row rather than the request body.
    const isOpeningStock = receipt.isOpeningStock;
    if (!isOpeningStock && (!truck || !truck.vehicleNumber)) {
      throw ApiError.badRequest('Truck vehicle number is required');
    }
    if (!Array.isArray(items) || items.length === 0) {
      throw ApiError.badRequest('At least one product line is required');
    }

    const products = await Product.findAll({
      where: { id: items.map((it) => it.product) },
      transaction,
    });
    const productsById = new Map(products.map((p) => [String(p.id), p]));

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

    const transporterDoc = await resolveTransporter(transporter, transaction);

    const originalItems = receipt.items.map((it) => it.toJSON());
    await reverseReceiptStock({ ...receipt.toJSON(), items: originalItems }, actor, transaction);
    // Reverse the original truck fare expense (if any) before re-resolving
    // the revised one below, so the funds check sees the true post-reversal
    // balance. Uses the receipt's still-original `transporter`/fare fields —
    // they aren't overwritten until after this call.
    await reverseTruckFareExpense(receipt, actor, transaction);
    const truckFareResolved = await resolveTruckFarePayment(
      truckFare,
      truckFarePaidBy,
      truckFareMethod,
      truckFareBankAccount,
      transporterDoc && transporterDoc.id,
      transaction,
    );
    const originalLabour = receipt.labour.map((l) => l.toJSON());
    await labourService.reverseLabourPayable(originalLabour, {
      when: new Date(),
      refType: REF.PURCHASE,
      refNo: receipt.number,
      store: receipt.store,
      actor,
      label: 'stock receipt',
      transaction,
    });
    const receiptLabour = await labourService.resolveLabourLines(labour, transaction);
    const labourRentPaisa = receiptLabour.reduce((s, l) => s + l.rent, 0);

    const when = date ? new Date(date) : receipt.date;

    let totalReceivedValue = 0;
    for (const line of lines) {
      if (line.receivedQuantity <= 0) continue;
      totalReceivedValue += await stockService.receiveStock(
        line.product.id,
        warehouseDoc.id,
        line.receivedQuantity,
        line.product.purchasePrice || 0,
        { refType: 'PURCHASE', refNo: receipt.number, date: when },
        null,
        transaction,
      );
    }

    receipt.supplier = supplierDoc.id;
    receipt.supplierName = supplierDoc.name;
    receipt.warehouse = warehouseDoc.id;
    receipt.date = when;
    receipt.truckVehicleNumber = (truck && truck.vehicleNumber) || '';
    receipt.truckDriverName = (truck && truck.driverName) || '';
    receipt.truckDriverPhone = (truck && truck.driverPhone) || '';
    receipt.transporter = transporterDoc ? transporterDoc.id : null;
    receipt.truckFare = truckFareResolved ? truckFareResolved.amount : toPaisa(truckFare || 0);
    receipt.truckFarePaidBy = truckFarePaidBy;
    receipt.truckFareMethod =
      truckFareResolved && truckFareResolved.settle ? truckFareMethod : null;
    receipt.truckFareBankAccount =
      truckFareResolved && truckFareResolved.settle ? truckFareResolved.settle.ref : null;
    receipt.labourRent = labourRentPaisa;
    receipt.note = (note || '').trim();
    await receipt.save({ transaction });

    await StockReceiptItem.destroy({ where: { stockReceiptId: receipt.id }, transaction });
    await StockReceiptItem.bulkCreate(
      lines.map((l, position) => ({
        stockReceiptId: receipt.id,
        position,
        product: l.product.id,
        name: l.product.name,
        receivedQuantity: l.receivedQuantity,
        damagedQuantity: l.damagedQuantity,
      })),
      { transaction },
    );
    await StockReceiptLabour.destroy({ where: { stockReceiptId: receipt.id }, transaction });
    await StockReceiptLabour.bulkCreate(
      receiptLabour.map((l, position) => ({ stockReceiptId: receipt.id, position, ...l })),
      { transaction },
    );

    if (totalReceivedValue > 0) {
      await journalService.post({
        date: when,
        description: `Revised stock receipt ${receipt.number} from ${supplierDoc.name}`,
        refType: REF.PURCHASE,
        refId: receipt.id,
        refNo: receipt.number,
        warehouse: receipt.warehouse,
        store: receipt.store,
        createdBy: actor ? actor.id : null,
        transaction,
        lines: [
          journalService.line(ACCOUNT.INVENTORY, { debit: totalReceivedValue }),
          journalService.line(ACCOUNT.EQUITY, { credit: totalReceivedValue }),
        ],
      });
    }

    await postTruckFareExpense(receipt, truckFareResolved, actor, transaction);

    await labourService.postLabourPayable(receiptLabour, {
      when,
      refType: REF.PURCHASE,
      refNo: receipt.number,
      store: receipt.store,
      actor,
      label: 'stock receipt',
      transaction,
    });

    // Re-snapshot the gate pass for the revised quantities/warehouse —
    // doesn't apply to opening stock (see createReceipt).
    if (!isOpeningStock) {
      receipt.items = lines.map((l) => ({
        product: l.product.id,
        name: l.product.name,
        receivedQuantity: l.receivedQuantity,
      }));
      const gatePass = await gatePassService.createForReceipt(receipt, transaction);
      const gatePassId = gatePass ? gatePass.id : null;
      if (String(receipt.gatePass || '') !== String(gatePassId || '')) {
        receipt.gatePass = gatePassId;
        await receipt.save({ transaction });
      }
    }

    return reloadWithAssociations(receipt.id, transaction);
  });
}

/**
 * Deletes a receipt after reversing its stock addition and the matching
 * journal entry (see reverseReceiptStock). Blocked once any of the
 * originally received stock has already been sold.
 */
async function deleteReceipt(actor, id) {
  return getPostgres().transaction(async (transaction) => {
    const { StockReceipt, StockReceiptItem, StockReceiptLabour, GatePass } = initializeModels();
    const receipt = await StockReceipt.findByPk(id, {
      include: [
        { model: StockReceiptItem, as: 'items', separate: true },
        { model: StockReceiptLabour, as: 'labour', separate: true },
      ],
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
    if (!receipt) throw ApiError.notFound('Stock receipt not found');
    assertStoreAccess(actor, receipt.store);

    const originalItems = receipt.items.map((it) => it.toJSON());
    await reverseReceiptStock({ ...receipt.toJSON(), items: originalItems }, actor, transaction);
    await reverseTruckFareExpense(receipt, actor, transaction);
    const originalLabour = receipt.labour.map((l) => l.toJSON());
    await labourService.reverseLabourPayable(originalLabour, {
      when: new Date(),
      refType: REF.PURCHASE,
      refNo: receipt.number,
      store: receipt.store,
      actor,
      label: 'stock receipt',
      transaction,
    });
    // Its gate pass no longer documents a real delivery once the receipt
    // (and the stock it added) is gone.
    await GatePass.destroy({
      where: { sourceType: 'PURCHASE', stockReceipt: receipt.id },
      transaction,
    });
    const json = receipt.toJSON();
    await receipt.destroy({ transaction });
    return json;
  });
}

/**
 * Records a payment to the supplier against this specific receipt's priced
 * items (Pending Entities that have already been given a purchase price —
 * see pendingEntityService.setPurchasePrice). Mirrors saleService.recordPayment
 * but in the opposite direction: Dr AP_SUPPLIER(supplier) / Cr Cash|Bank,
 * since this is paying down a payable rather than collecting a receivable.
 */
async function recordPayment(actor, id, { amount, method, bankAccount, note }) {
  return getPostgres().transaction(async (transaction) => {
    const { StockReceipt } = initializeModels();
    const receipt = await StockReceipt.findByPk(id, { transaction, lock: transaction.LOCK.UPDATE });
    if (!receipt) throw ApiError.notFound('Stock receipt not found');
    assertStoreAccess(actor, receipt.store);

    const amt = toPaisa(amount);
    if (amt <= 0) throw ApiError.badRequest('Amount must be positive');

    const totals = await pendingEntityService.pricedTotalsByStockReceipt([receipt.id], transaction);
    const pricedTotal = totals.get(String(receipt.id)) || 0;
    const remaining = Math.max(0, pricedTotal - receipt.additionalPaidAmount);
    if (amt > remaining) {
      throw ApiError.badRequest('Amount exceeds the remaining balance owed on this receipt');
    }

    const settle = await paymentService.settlementAccount(
      method,
      bankAccount,
      undefined,
      transaction,
    );
    await paymentService.assertSufficientFunds(settle.account, settle.ref, amt, transaction);
    const when = new Date();

    await journalService.post({
      date: when,
      description: note || `Payment to ${receipt.supplierName} for receipt ${receipt.number}`,
      refType: REF.PURCHASE,
      refId: receipt.id,
      refNo: receipt.number,
      warehouse: receipt.warehouse,
      store: receipt.store,
      createdBy: actor ? actor.id : null,
      transaction,
      lines: [
        journalService.line(ACCOUNT.AP_SUPPLIER, { debit: amt, ref: receipt.supplier }),
        journalService.line(settle.account, { credit: amt, ref: settle.ref }),
      ],
    });

    receipt.additionalPaidAmount += amt;
    await receipt.save({ transaction });
    return receipt;
  });
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
  const { StockReceipt, StockReceiptLabour, Warehouse, Store, Transporter } = initializeModels();
  const { page, limit, skip } = parsePagination(query);
  const where = {};
  if (supplier) where.supplier = supplier;
  if (transporter) where.transporter = transporter;
  // Every receipt now records its own storefront directly — filter on that
  // rather than the indirect (and looser) warehouse-membership scoping. A
  // store-restricted actor's own store always wins over the query param.
  const effectiveStore = actorStoreId(actor) || store;
  if (effectiveStore && isValidId(effectiveStore)) {
    where.store = effectiveStore;
  } else if (warehouse) {
    const { warehouseIds } = await resolveWarehouseScope({ warehouse, actor });
    Object.assign(where, warehouseWhere(warehouseIds));
  }
  if (from || to) {
    where.date = {};
    if (from) where.date[Op.gte] = new Date(from);
    if (to) where.date[Op.lte] = new Date(to);
  }
  if (search) {
    const term = `%${escapeLike(search)}%`;
    where[Op.or] = [
      { number: { [Op.iLike]: term } },
      { supplierName: { [Op.iLike]: term } },
      { truckVehicleNumber: { [Op.iLike]: term } },
    ];
  }

  const { rows, count } = await StockReceipt.findAndCountAll({
    where,
    include: [
      { model: Warehouse, as: 'warehouseInfo', attributes: ['id', 'name'] },
      { model: Store, as: 'storeInfo', attributes: ['id', 'name', 'code'] },
      {
        model: Transporter,
        as: 'transporterInfo',
        attributes: ['id', 'name', 'phone', 'vehicleNumber'],
      },
      ...(labour
        ? [
            {
              model: StockReceiptLabour,
              as: 'labour',
              attributes: [],
              where: { labour },
              required: true,
            },
          ]
        : []),
    ],
    order: [
      ['date', 'DESC'],
      ['createdAt', 'DESC'],
    ],
    offset: skip,
    limit,
    distinct: true,
  });

  return { receipts: rows, total: count, page, limit };
}

module.exports = { createReceipt, updateReceipt, deleteReceipt, listReceipts, recordPayment };
