const { Op, QueryTypes } = require('sequelize');
const { getPostgres } = require('../db/postgres');
const { initializeModels } = require('../db/models');
const ApiError = require('../utils/ApiError');
const { toPaisa } = require('../utils/money');
const { ACCOUNT, REF } = require('../utils/finance');
const journalService = require('./journalService');
const { parsePagination, escapeLike } = require('../utils/query');
const { resolveStoreScope, storeWhere, assertStoreAccess } = require('../utils/storeScope');

/**
 * Tracks items procured from a vendor/supplier whose cost isn't known yet —
 * vendor-sourced sale lines and stock receipt lines — so a super admin can
 * price them later and only then does the party actually go payable. See
 * db/models/pendingEntityModel.js for why this exists.
 */

// One row per vendor-sourced sale line. Called only from saleService.createSale
// (not on edit — see the module's plan notes on scope). Must run inside the
// caller's transaction (part of the atomic sale creation).
async function recordSaleVendorItems(sale, vendorLineItems, actor, transaction) {
  if (!Array.isArray(vendorLineItems) || vendorLineItems.length === 0) return [];
  const { PendingEntity } = initializeModels();
  const docs = vendorLineItems.map((li) => ({
    sourceType: 'SALE_ITEM',
    sale: sale.id,
    sourceNo: sale.number,
    vendor: li.vendor,
    vendorName: li.vendorName,
    product: li.product,
    productName: li.name,
    quantity: li.quantity,
    store: sale.store,
    warehouse: null,
    date: sale.date,
    createdBy: actor ? actor.id : null,
  }));
  return PendingEntity.bulkCreate(docs, { transaction });
}

// One row per labour line on a sale made while the store's labour pricing
// mode is PENDING (see db/migrations/024-labour-pricing-mode.js). The rent
// charged to the customer is snapshotted as `chargedAmount`; the labourer's
// actual payout is entered later via setPurchasePrice. Called from
// saleService (create, and edit when the sale's labour is replaced). Must run
// inside the caller's transaction.
async function recordSaleLabourItems(sale, labourLines, actor, transaction) {
  if (!Array.isArray(labourLines) || labourLines.length === 0) return [];
  const { PendingEntity } = initializeModels();
  const docs = labourLines.map((l) => ({
    sourceType: 'SALE_LABOUR',
    sale: sale.id,
    sourceNo: sale.number,
    labour: l.labour,
    labourName: l.name,
    serviceName: l.serviceName || '',
    chargedAmount: l.rent || 0,
    quantity: 1,
    store: sale.store,
    warehouse: null,
    date: sale.date,
    createdBy: actor ? actor.id : null,
  }));
  return PendingEntity.bulkCreate(docs, { transaction });
}

// Undoes recordSaleLabourItems for a sale whose labour is being replaced:
// reverses the AP_LABOUR payable of every line that was already priced
// (journal entries are append-only), then deletes the sale's SALE_LABOUR
// rows so the edit can record fresh ones. Must run inside the caller's
// transaction.
async function removeSaleLabourItems(sale, actor, transaction) {
  const { PendingEntity } = initializeModels();
  const rows = await PendingEntity.findAll({
    where: { sale: sale.id, sourceType: 'SALE_LABOUR' },
    transaction,
    lock: transaction.LOCK.UPDATE,
  });
  for (const row of rows) {
    if (row.status === 'PRICED' && row.lineTotal > 0) {
      await journalService.post({
        date: new Date(),
        description: `Reversal of labour payout for edited sale ${row.sourceNo}`,
        refType: REF.PENDING_ENTITY,
        refId: row.id,
        refNo: row.sourceNo,
        store: row.store,
        createdBy: actor ? actor.id : null,
        transaction,
        lines: [
          journalService.line(ACCOUNT.AP_LABOUR, { debit: row.lineTotal, ref: row.labour }),
          journalService.line(ACCOUNT.OPERATING_EXPENSE, { credit: row.lineTotal }),
        ],
      });
    }
  }
  await PendingEntity.destroy({
    where: { sale: sale.id, sourceType: 'SALE_LABOUR' },
    transaction,
  });
}

// One row per received stock-receipt line. Called only from
// stockReceiptService.createReceipt. Must run inside the caller's transaction.
async function recordStockReceiptItems(receipt, receivedLines, actor, transaction) {
  if (!Array.isArray(receivedLines) || receivedLines.length === 0) return [];
  const { PendingEntity } = initializeModels();
  const docs = receivedLines.map((l) => ({
    sourceType: 'STOCK_RECEIPT_ITEM',
    stockReceipt: receipt.id,
    sourceNo: receipt.number,
    supplier: receipt.supplier,
    supplierName: receipt.supplierName,
    product: l.product.id || l.product,
    productName: l.product.name || l.name,
    quantity: l.receivedQuantity,
    store: receipt.store,
    warehouse: receipt.warehouse,
    date: receipt.date,
    createdBy: actor ? actor.id : null,
  }));
  return PendingEntity.bulkCreate(docs, { transaction });
}

async function listPendingEntities({
  status,
  vendor,
  supplier,
  store,
  sourceType,
  search,
  actor,
  ...query
} = {}) {
  const { PendingEntity, Vendor, Supplier, Product, Store, Warehouse } = initializeModels();
  const { page, limit, skip } = parsePagination(query);
  const { storeIds } = await resolveStoreScope({ store, actor });
  const where = { ...storeWhere(storeIds) };
  if (status) where.status = status;
  if (vendor) where.vendor = vendor;
  if (supplier) where.supplier = supplier;
  if (sourceType) where.sourceType = sourceType;
  if (search) {
    const term = `%${escapeLike(search)}%`;
    where[Op.or] = [
      { sourceNo: { [Op.iLike]: term } },
      { vendorName: { [Op.iLike]: term } },
      { supplierName: { [Op.iLike]: term } },
      { productName: { [Op.iLike]: term } },
      { labourName: { [Op.iLike]: term } },
      { serviceName: { [Op.iLike]: term } },
    ];
  }

  const { rows, count } = await PendingEntity.findAndCountAll({
    where,
    include: [
      { model: Vendor, as: 'vendorInfo', attributes: ['id', 'name'] },
      { model: Supplier, as: 'supplierInfo', attributes: ['id', 'name'] },
      { model: Product, as: 'productInfo', attributes: ['id', 'name'] },
      { model: Store, as: 'storeInfo', attributes: ['id', 'name', 'code'] },
      { model: Warehouse, as: 'warehouseInfo', attributes: ['id', 'name'] },
    ],
    order: [
      ['date', 'DESC'],
      ['createdAt', 'DESC'],
    ],
    offset: skip,
    limit,
  });

  return { entities: rows, total: count, page, limit };
}

// Same rows as listPendingEntities, folded into one row per source
// invoice/receipt (sourceType + sourceNo) instead of one row per line item —
// what the pending-entities table actually shows the user. An invoice stays
// PENDING while any of its lines still needs a price, and only flips to
// PRICED once every line does; `status` filters on that folded status, not
// the per-line one. Grouping/pagination happen in JS since this only ever
// runs over one actor's (store-scoped) queue, not the whole ledger.
async function listPendingEntityInvoices({
  status,
  vendor,
  supplier,
  store,
  sourceType,
  search,
  actor,
  ...query
} = {}) {
  const { PendingEntity, Store, Warehouse } = initializeModels();
  const { page, limit } = parsePagination(query);
  const { storeIds } = await resolveStoreScope({ store, actor });
  const where = { ...storeWhere(storeIds) };
  if (vendor) where.vendor = vendor;
  if (supplier) where.supplier = supplier;
  if (sourceType) where.sourceType = sourceType;
  if (search) {
    const term = `%${escapeLike(search)}%`;
    where[Op.or] = [
      { sourceNo: { [Op.iLike]: term } },
      { vendorName: { [Op.iLike]: term } },
      { supplierName: { [Op.iLike]: term } },
      { productName: { [Op.iLike]: term } },
      { labourName: { [Op.iLike]: term } },
      { serviceName: { [Op.iLike]: term } },
    ];
  }

  const rows = await PendingEntity.findAll({
    where,
    include: [
      { model: Store, as: 'storeInfo', attributes: ['id', 'name', 'code'] },
      { model: Warehouse, as: 'warehouseInfo', attributes: ['id', 'name'] },
    ],
    order: [
      ['date', 'DESC'],
      ['createdAt', 'DESC'],
    ],
  });

  const groups = new Map();
  for (const row of rows) {
    const key = `${row.sourceType}:${row.sourceNo}`;
    let group = groups.get(key);
    if (!group) {
      group = {
        sourceType: row.sourceType,
        sourceNo: row.sourceNo,
        vendorName: row.vendorName || row.supplierName,
        labourNames: new Set(),
        storeName: row.storeInfo ? row.storeInfo.name : undefined,
        warehouseName: row.warehouseInfo ? row.warehouseInfo.name : undefined,
        date: row.date,
        itemCount: 0,
        pricedCount: 0,
        total: 0,
        chargedTotal: 0,
      };
      groups.set(key, group);
    }
    if (row.labourName) group.labourNames.add(row.labourName);
    group.chargedTotal += row.chargedAmount || 0;
    group.itemCount += 1;
    if (row.status === 'PRICED') {
      group.pricedCount += 1;
      group.total += row.lineTotal || 0;
    }
  }

  let invoices = Array.from(groups.values()).map((g) => ({
    id: `${g.sourceType}:${g.sourceNo}`,
    sourceType: g.sourceType,
    sourceNo: g.sourceNo,
    // A labour invoice has no vendor — show who it pays instead.
    vendorName:
      g.sourceType === 'SALE_LABOUR' ? Array.from(g.labourNames).join(', ') : g.vendorName,
    storeName: g.storeName,
    warehouseName: g.warehouseName,
    date: g.date,
    itemCount: g.itemCount,
    pricedCount: g.pricedCount,
    status: g.pricedCount === g.itemCount ? 'PRICED' : 'PENDING',
    total: g.pricedCount > 0 ? g.total : undefined,
    chargedTotal: g.sourceType === 'SALE_LABOUR' ? g.chargedTotal : undefined,
  }));

  if (status) invoices = invoices.filter((inv) => inv.status === status);
  invoices.sort((a, b) => new Date(b.date) - new Date(a.date));

  const total = invoices.length;
  const start = (page - 1) * limit;
  return { invoices: invoices.slice(start, start + limit), total, page, limit };
}

// All line items belonging to one invoice/receipt — the "open an invoice"
// detail view backing the price-entry modal. Not paginated: an invoice's own
// line count is always small.
async function listInvoiceItems(actor, sourceType, sourceNo) {
  const { PendingEntity, Vendor, Supplier, Product, Labour, Store, Warehouse } = initializeModels();
  const { storeIds } = await resolveStoreScope({ actor });
  const where = { ...storeWhere(storeIds), sourceType, sourceNo };

  return PendingEntity.findAll({
    where,
    include: [
      { model: Vendor, as: 'vendorInfo', attributes: ['id', 'name'] },
      { model: Supplier, as: 'supplierInfo', attributes: ['id', 'name'] },
      { model: Product, as: 'productInfo', attributes: ['id', 'name'] },
      { model: Labour, as: 'labourInfo', attributes: ['id', 'name', 'phoneNumber'] },
      { model: Store, as: 'storeInfo', attributes: ['id', 'name', 'code'] },
      { model: Warehouse, as: 'warehouseInfo', attributes: ['id', 'name'] },
    ],
    order: [['createdAt', 'ASC']],
  });
}

// Sum of PRICED lineTotal (paisa) per stock receipt, for many receipts at
// once — this is "amount owed to the vendor so far" for each receipt (lines
// still PENDING don't count yet). Returns Map<stockReceiptIdString, paisa>.
async function pricedTotalsByStockReceipt(stockReceiptIds, transaction) {
  const map = new Map();
  if (!Array.isArray(stockReceiptIds) || stockReceiptIds.length === 0) return map;
  const rows = await getPostgres().query(
    `SELECT stock_receipt_id AS "stockReceipt", COALESCE(SUM(line_total), 0) AS total
     FROM pending_entities
     WHERE stock_receipt_id IN (:ids) AND status = 'PRICED'
     GROUP BY stock_receipt_id`,
    { replacements: { ids: stockReceiptIds }, transaction, type: QueryTypes.SELECT },
  );
  for (const r of rows) map.set(String(r.stockReceipt), r.total);
  return map;
}

// All pending entities for a set of stock receipts, grouped by receipt id —
// used to show each line's own price/status on the receipt (invoice, detail
// view). Returns Map<stockReceiptIdString, PendingEntity[]>.
async function listByStockReceipts(stockReceiptIds, transaction) {
  const map = new Map();
  if (!Array.isArray(stockReceiptIds) || stockReceiptIds.length === 0) return map;
  const { PendingEntity } = initializeModels();
  const docs = await PendingEntity.findAll({
    where: { stockReceipt: { [Op.in]: stockReceiptIds } },
    transaction,
  });
  for (const d of docs) {
    const key = String(d.stockReceipt);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(d.toJSON());
  }
  return map;
}

async function getPendingEntityById(actor, id) {
  const { PendingEntity, Vendor, Supplier, Product, Store, Warehouse } = initializeModels();
  const entity = await PendingEntity.findByPk(id, {
    include: [
      { model: Vendor, as: 'vendorInfo', attributes: ['id', 'name'] },
      { model: Supplier, as: 'supplierInfo', attributes: ['id', 'name'] },
      { model: Product, as: 'productInfo', attributes: ['id', 'name'] },
      { model: Store, as: 'storeInfo', attributes: ['id', 'name', 'code'] },
      { model: Warehouse, as: 'warehouseInfo', attributes: ['id', 'name'] },
    ],
  });
  if (!entity) throw ApiError.notFound('Pending entity not found');
  if (entity.store) assertStoreAccess(actor, entity.store);
  return entity;
}

/**
 * Prices a pending entity (or revises an already-priced one) and posts the
 * real payable:
 *  - SALE_ITEM: Dr COGS / Cr AP(vendor) — the cost the sale never booked,
 *    matched against revenue already recorded at checkout.
 *  - STOCK_RECEIPT_ITEM: Dr EQUITY / Cr AP_SUPPLIER(supplier) — reattributes
 *    the receipt's existing inventory funding from equity to supplier debt.
 *    Inventory value itself is untouched.
 *  - SALE_LABOUR: Dr Operating Expense / Cr AP_LABOUR(labourer) — the payout
 *    agreed with the labourer. The customer's labour charge was already
 *    booked as SALES revenue at checkout, so whatever isn't paid out
 *    (chargedAmount − payout) simply stays with the store as margin. A
 *    payout of 0 is allowed (nothing owed), and posts no entry.
 *
 * Re-pricing an already-PRICED entity first reverses its original posting
 * (journal entries are append-only, so "correct" always means posting the
 * opposite entry, never touching the original) before posting the revised
 * one — same pattern as expenseService's edit flow.
 */
function pricingAccounts(entity) {
  switch (entity.sourceType) {
    case 'SALE_ITEM':
      return {
        debitAccount: ACCOUNT.COGS,
        payableAccount: ACCOUNT.AP,
        payableRef: entity.vendor,
        description: `Cost for vendor item on sale ${entity.sourceNo}`,
        reversal: `Reversal of price for vendor item on sale ${entity.sourceNo}`,
      };
    case 'SALE_LABOUR':
      return {
        debitAccount: ACCOUNT.OPERATING_EXPENSE,
        payableAccount: ACCOUNT.AP_LABOUR,
        payableRef: entity.labour,
        description: `Labour payout to ${entity.labourName}${entity.serviceName ? ` (${entity.serviceName})` : ''} for sale ${entity.sourceNo}`,
        reversal: `Reversal of labour payout for sale ${entity.sourceNo}`,
      };
    default:
      return {
        debitAccount: ACCOUNT.EQUITY,
        payableAccount: ACCOUNT.AP_SUPPLIER,
        payableRef: entity.supplier,
        description: `Supplier cost for stock receipt ${entity.sourceNo}`,
        reversal: `Reversal of price for stock receipt ${entity.sourceNo}`,
      };
  }
}

async function setPurchasePrice(actor, id, purchasePrice) {
  const { PendingEntity } = initializeModels();
  return getPostgres().transaction(async (transaction) => {
    const entity = await PendingEntity.findByPk(id, { transaction, lock: transaction.LOCK.UPDATE });
    if (!entity) throw ApiError.notFound('Pending entity not found');
    if (entity.store) assertStoreAccess(actor, entity.store);

    const isLabour = entity.sourceType === 'SALE_LABOUR';
    const price = toPaisa(purchasePrice);
    if (price < 0 || (!isLabour && price === 0)) {
      throw ApiError.badRequest('Purchase price must be positive');
    }
    const lineTotal = Math.round(price * entity.quantity);

    const { debitAccount, payableAccount, payableRef, description, reversal } =
      pricingAccounts(entity);
    const wasPriced = entity.status === 'PRICED';

    if (wasPriced && entity.lineTotal > 0) {
      await journalService.post({
        date: new Date(),
        description: reversal,
        refType: REF.PENDING_ENTITY,
        refId: entity.id,
        refNo: entity.sourceNo,
        warehouse: entity.warehouse,
        store: entity.store,
        createdBy: actor ? actor.id : null,
        transaction,
        lines: [
          journalService.line(payableAccount, { debit: entity.lineTotal, ref: payableRef }),
          journalService.line(debitAccount, { credit: entity.lineTotal }),
        ],
      });
    }

    if (lineTotal > 0) {
      await journalService.post({
        date: new Date(),
        description: wasPriced ? `${description} (revised)` : description,
        refType: REF.PENDING_ENTITY,
        refId: entity.id,
        refNo: entity.sourceNo,
        warehouse: entity.warehouse,
        store: entity.store,
        createdBy: actor ? actor.id : null,
        transaction,
        lines: [
          journalService.line(debitAccount, { debit: lineTotal }),
          journalService.line(payableAccount, { credit: lineTotal, ref: payableRef }),
        ],
      });
    }

    entity.status = 'PRICED';
    entity.purchasePrice = price;
    entity.lineTotal = lineTotal;
    entity.pricedBy = actor ? actor.id : null;
    entity.pricedAt = new Date();
    await entity.save({ transaction });

    return entity;
  });
}

module.exports = {
  recordSaleVendorItems,
  recordSaleLabourItems,
  removeSaleLabourItems,
  recordStockReceiptItems,
  listPendingEntities,
  listPendingEntityInvoices,
  listInvoiceItems,
  getPendingEntityById,
  setPurchasePrice,
  pricedTotalsByStockReceipt,
  listByStockReceipts,
};
