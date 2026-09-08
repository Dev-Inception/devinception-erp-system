const { Op } = require('sequelize');
const { initializeModels } = require('../db/models');
const { getPostgres } = require('../db/postgres');
const ApiError = require('../utils/ApiError');
const { toPaisa } = require('../utils/money');
const { ACCOUNT, REF, PAYMENT_METHOD, BANK_METHODS } = require('../utils/finance');
const journalService = require('./journalService');
const stockService = require('./stockService');
const counterService = require('./counterService');
const { calculateInvoiceTotals, resolveUnitPrice } = require('./invoiceCalculationService');
const { parsePagination } = require('../utils/query');
const { normalizeQuantity, requirePositiveQuantity } = require('../utils/quantity');
const { assertProductWarehouse } = require('../utils/productWarehouse');
const gatePassService = require('./gatePassService');
const {
  Sale,
  SaleItem,
  SaleLabour,
  Customer,
  Labour,
  Product,
  StockLevel,
  BankAccount,
  Warehouse,
  Store,
} = initializeModels();

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

async function createSale(actor, input) {
  const {
    customer,
    warehouse,
    date,
    items,
    labour = [],
    discount = 0,
    taxPercent = 0,
    payment = {},
    store,
    transport = {},
    transporter = null,
    transportFare = 0,
  } = input;

  if (!Array.isArray(items) || items.length === 0) {
    throw ApiError.badRequest('At least one item is required');
  }
  const method = payment.method;
  if (!method) throw ApiError.badRequest('A payment method is required');

  return getPostgres().transaction(async (transaction) => {
    const storeId = (actor && actor.store) || store;
    if (!storeId || !(await Store.findByPk(storeId, { transaction }))) {
      throw ApiError.badRequest('A store is required');
    }
    const customerDoc = customer ? await Customer.findByPk(customer, { transaction }) : null;
    if (customer && !customerDoc) throw ApiError.notFound('Customer not found');

    const wh = warehouse
      ? await require('./warehouseService').getWarehouseById(warehouse)
      : await stockService.ensureDefaultWarehouse({ transaction });

    const labourIds = Array.from(
      new Set((labour || []).map((entry) => String(entry.labour || entry)).filter(Boolean)),
    );
    const labourDocs = labourIds.length
      ? await Labour.findAll({ where: { id: { [Op.in]: labourIds } }, transaction })
      : [];
    if (labourDocs.length !== labourIds.length) {
      throw ApiError.badRequest('One or more labour entries are invalid');
    }
    const rentByLabour = new Map(
      (labour || [])
        .filter((entry) => entry && typeof entry === 'object')
        .map((entry) => [String(entry.labour), toPaisa(entry.rent || 0)]),
    );
    const saleLabour = labourDocs.map((doc) => ({
      labour: doc.id,
      name: doc.name,
      phoneNumber: doc.phoneNumber,
      rent: rentByLabour.get(String(doc.id)) || 0,
    }));
    const labourRent = saleLabour.reduce((sum, entry) => sum + entry.rent, 0);

    // Build line items (paisa) and pre-check stock so we never half-sell.
    const unresolvedLines = [];
    const requestedByProduct = new Map();
    for (const it of items) {
      const product = await Product.findByPk(it.product, { transaction });
      if (!product) throw ApiError.notFound(`Product not found: ${it.product}`);
      assertProductWarehouse(product, wh);
      const quantity = requirePositiveQuantity(it.quantity, 'Item quantity must be positive');

      const unitPrice = resolveUnitPrice(it.unitPrice, product.salePrice);

      const productKey = String(product.id);
      const requested = requirePositiveQuantity(
        (requestedByProduct.get(productKey) || 0) + quantity,
        'Requested item quantity is too large',
      );
      requestedByProduct.set(productKey, requested);
      const level = await StockLevel.findOne({
        where: { product: product.id, warehouse: wh.id },
        transaction,
      });
      const available = level ? normalizeQuantity(level.quantity) : Number.NaN;
      if (!Number.isFinite(available) || available < requested) {
        throw ApiError.badRequest(`Insufficient stock for ${product.name}`);
      }
      unresolvedLines.push({ product: product.id, name: product.name, quantity, unitPrice });
    }

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
      total: productTotal,
    } = calculated;
    const transportFarePaisa = toPaisa(transportFare || 0);
    const total = productTotal + transportFarePaisa + labourRent;

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
      const bank = await BankAccount.findByPk(payment.bankAccount, { transaction });
      if (!bank) throw ApiError.notFound('Bank account not found');
      bankRef = bank.id;
    }

    const when = date ? new Date(date) : new Date();
    const number = await counterService.nextDocNumber('SALE', when.getFullYear(), 6, transaction);

    // Issue stock and capture COGS per line.
    let cost = 0;
    for (const li of lineItems) {
      const lineCost = await stockService.issueStock(
        li.product,
        wh.id,
        li.quantity,
        { refType: REF.SALE, refNo: number, date: when },
        transaction,
      );
      li.cost = lineCost;
      cost += lineCost;
    }

    const sale = await Sale.create(
      {
        number,
        customer: customerDoc ? customerDoc.id : null,
        customerName: customerDoc ? customerDoc.name : 'Walk-in',
        store: storeId,
        warehouse: wh.id,
        date: when,
        subtotal,
        discount: discountPaisa,
        taxPercent: taxPct,
        tax,
        total,
        cost,
        transport,
        transporter,
        transportFare: transportFarePaisa,
        labourRent,
        paymentMethod: method,
        cashAmount: cash,
        onlineAmount: online,
        creditAmount: credit,
        bankAccount: bankRef,
        transferReceiptRef: receiptRef,
        createdBy: actor ? actor._id : null,
      },
      { transaction },
    );
    await SaleItem.bulkCreate(
      lineItems.map((item, position) => ({ ...item, position, saleId: sale.id })),
      { transaction, validate: true },
    );
    await SaleLabour.bulkCreate(
      saleLabour.map((item, position) => ({ ...item, position, saleId: sale.id })),
      { transaction, validate: true },
    );

    // Revenue: Dr Cash/Bank/Receivable ... Cr Sales (total).
    const revenueLines = [];
    if (cash > 0) revenueLines.push(journalService.line(ACCOUNT.CASH, { debit: cash }));
    if (online > 0)
      revenueLines.push(journalService.line(ACCOUNT.BANK, { debit: online, ref: bankRef }));
    if (credit > 0)
      revenueLines.push(journalService.line(ACCOUNT.AR, { debit: credit, ref: customerDoc.id }));
    if (net > 0) revenueLines.push(journalService.line(ACCOUNT.SALES, { credit: net }));
    if (tax > 0) revenueLines.push(journalService.line(ACCOUNT.TAX, { credit: tax }));

    // A fully discounted sale has no revenue/payment entry, but still records
    // its inventory/COGS movement below. Avoid posting an invalid all-zero entry.
    if (revenueLines.length > 0) {
      await journalService.post({
        date: when,
        description: `POS sale ${number}`,
        refType: REF.SALE,
        refId: sale.id,
        refNo: number,
        warehouse: wh.id,
        store: storeId,
        createdBy: actor ? actor._id : null,
        lines: revenueLines,
        transaction,
      });
    }

    // Cost of goods sold: Dr COGS / Cr Inventory.
    if (cost > 0) {
      await journalService.post({
        date: when,
        description: `COGS ${number}`,
        refType: REF.SALE,
        refId: sale.id,
        refNo: number,
        warehouse: wh.id,
        store: storeId,
        createdBy: actor ? actor._id : null,
        lines: [
          journalService.line(ACCOUNT.COGS, { debit: cost }),
          journalService.line(ACCOUNT.INVENTORY, { credit: cost }),
        ],
        transaction,
      });
    }

    const saleWithItems = { ...sale.get(), id: sale.id, _id: sale.id, items: lineItems };
    await gatePassService.createGatePassesForSale(saleWithItems, customerDoc, transaction);
    return getSaleById(null, sale.id, transaction);
  });
}

async function listSales({ customer, from, to, paymentMethod, ...query } = {}) {
  const { page, limit, skip } = parsePagination(query);
  const where = {};
  if (customer) where.customer = customer;
  if (paymentMethod) where.paymentMethod = paymentMethod;
  if (from || to) {
    where.date = {};
    if (from) where.date[Op.gte] = new Date(from);
    if (to) where.date[Op.lte] = new Date(to);
  }

  const [sales, total] = await Promise.all([
    Sale.findAll({
      where,
      include: [
        { model: SaleItem, as: 'items' },
        { model: SaleLabour, as: 'labour' },
      ],
      order: [
        ['date', 'DESC'],
        ['createdAt', 'DESC'],
      ],
      offset: skip,
      limit,
    }),
    Sale.count({ where }),
  ]);

  return { sales, total, page, limit };
}

async function getSaleById(actor, id, transaction = null) {
  if (typeof actor === 'string') {
    transaction = id || null;
    id = actor;
    actor = null;
  }
  const sale = await Sale.findByPk(id, {
    include: [
      { model: SaleItem, as: 'items' },
      { model: SaleLabour, as: 'labour' },
      { model: Customer, as: 'customerInfo', attributes: ['id', 'name', 'phone'] },
      { model: Warehouse, as: 'warehouseInfo', attributes: ['id', 'name'] },
    ],
    transaction,
  });
  if (!sale) throw ApiError.notFound('Sale not found');
  if (actor?.store && String(actor.store) !== String(sale.store)) {
    throw ApiError.forbidden('You do not have access to this store');
  }
  return sale;
}

async function recordPayment(actor, saleId, { amount, method, bankAccount, note }) {
  return getPostgres().transaction(async (transaction) => {
    const sale = await Sale.findByPk(saleId, { transaction, lock: transaction.LOCK.UPDATE });
    if (!sale) throw ApiError.notFound('Sale not found');
    if (!sale.customer) throw ApiError.badRequest('A customer is required to record a payment');
    const value = toPaisa(amount);
    const remaining = Math.max(
      0,
      Number(sale.total) -
        Number(sale.returnedTotal || 0) -
        Number(sale.cashAmount || 0) -
        Number(sale.onlineAmount || 0) -
        Number(sale.additionalPaidAmount || 0),
    );
    if (value <= 0) throw ApiError.badRequest('Amount must be positive');
    if (value > remaining)
      throw ApiError.badRequest('Amount exceeds the remaining balance on this sale');
    const { settlementAccount } = require('./paymentService');
    const settle = await settlementAccount(method, bankAccount, sale.store, transaction);
    await journalService.post({
      date: new Date(),
      description: note || `Payment received for sale ${sale.number}`,
      refType: REF.SALE,
      refId: sale.id,
      refNo: sale.number,
      store: sale.store,
      createdBy: actor && (actor.id || actor._id),
      lines: [
        journalService.line(settle.account, { debit: value, ref: settle.ref }),
        journalService.line(ACCOUNT.AR, { credit: value, ref: sale.customer }),
      ],
      transaction,
    });
    await sale.increment('additionalPaidAmount', { by: value, transaction });
    return getSaleById(actor, sale.id, transaction);
  });
}

async function updateSale(actor, id) {
  const sale = await getSaleById(actor, id);
  throw ApiError.conflict(
    `Sale ${sale.number} cannot be edited after posting; create a return and replacement sale to preserve the audit trail`,
  );
}

async function getSaleBalances(sale) {
  const customer = sale.customerInfo?.id || sale.customer;
  if (!customer) return { previousBalance: null, totalRemaining: null };
  const at = new Date(sale.date);
  const [previous, remaining] = await Promise.all([
    journalService.balanceAsOf(ACCOUNT.AR, customer, new Date(at.getTime() - 1)),
    journalService.balanceAsOf(ACCOUNT.AR, customer, at),
  ]);
  const { toRupees } = require('../utils/money');
  return { previousBalance: toRupees(previous), totalRemaining: toRupees(remaining) };
}

module.exports = { createSale, updateSale, recordPayment, listSales, getSaleById, getSaleBalances };
