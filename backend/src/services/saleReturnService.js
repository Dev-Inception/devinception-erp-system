const { Op } = require('sequelize');
const { initializeModels } = require('../db/models');
const { getPostgres } = require('../db/postgres');
const ApiError = require('../utils/ApiError');
const { ACCOUNT, REF } = require('../utils/finance');
const journalService = require('./journalService');
const stockService = require('./stockService');
const counterService = require('./counterService');
const gatePassService = require('./gatePassService');
const { requirePositiveQuantity, normalizeQuantity } = require('../utils/quantity');
const { parsePagination } = require('../utils/query');
const { Sale, SaleItem, SaleReturn, SaleReturnItem, SaleReturnGatePass } = initializeModels();
const actorId = (actor) => actor && (actor.id || actor._id);
async function load(id, transaction) {
  const row = await SaleReturn.findByPk(id, {
    include: [{ model: SaleReturnItem, as: 'items' }],
    transaction,
  });
  if (!row) return null;
  const value = row.toJSON();
  const links = await SaleReturnGatePass.findAll({ where: { saleReturnId: id }, transaction });
  value.warehouseGatePasses = links.map((link) => ({
    warehouse: link.warehouseId,
    gatePass: link.gatePassId,
  }));
  return value;
}
async function createReturn(actor, saleId, input) {
  const sale = await Sale.findByPk(saleId, { include: [{ model: SaleItem, as: 'items' }] });
  if (!sale) throw ApiError.notFound('Sale not found');
  if (!sale.customer)
    throw ApiError.badRequest('Returns require the sale to have a customer on file');
  if (!input.items?.length) throw ApiError.badRequest('At least one returned item is required');
  const prior = await SaleReturn.findAll({
    where: { sale: sale.id },
    include: [{ model: SaleReturnItem, as: 'items' }],
  });
  const returned = new Map();
  for (const doc of prior)
    for (const item of doc.items)
      returned.set(item.product, (returned.get(item.product) || 0) + Number(item.quantity));
  const originals = new Map(sale.items.map((item) => [item.product, item]));
  let subtotal = 0;
  const lines = input.items.map((item) => {
    const original = originals.get(String(item.product));
    if (!original) throw ApiError.badRequest(`Product ${item.product} was not part of this sale`);
    const quantity = requirePositiveQuantity(item.quantity, 'Return quantity must be positive');
    const available = normalizeQuantity(
      Number(original.quantity) - (returned.get(original.product) || 0),
    );
    if (quantity > available)
      throw ApiError.badRequest(
        `Cannot return ${quantity} of ${original.name} — only ${available} remain returnable`,
      );
    const lineTotal = Math.round(Number(original.unitPrice) * quantity);
    const cost =
      original.source === 'WAREHOUSE' && Number(original.quantity) > 0
        ? Math.round((Number(original.cost) / Number(original.quantity)) * quantity)
        : 0;
    subtotal += lineTotal;
    return {
      product: original.product,
      name: original.name,
      quantity,
      unitPrice: Number(original.unitPrice),
      lineTotal,
      cost,
      source: original.source,
      warehouse: original.source === 'WAREHOUSE' ? original.warehouse || sale.warehouse : null,
    };
  });
  const discount =
    Number(sale.subtotal) > 0
      ? Math.round((Number(sale.discount) * subtotal) / Number(sale.subtotal))
      : 0;
  const net = subtotal - discount;
  const tax = Math.round((net * Number(sale.taxPercent)) / 100);
  const total = net + tax;
  if (total > Math.max(0, Number(sale.total) - Number(sale.returnedTotal || 0)))
    throw ApiError.badRequest("Return amount exceeds the sale's remaining value");
  const when = new Date();
  const number = await counterService.nextDocNumber('RETURN', when.getFullYear(), 6);
  return getPostgres().transaction(async (transaction) => {
    let cost = 0;
    for (const line of lines)
      if (line.source === 'WAREHOUSE' && line.warehouse)
        cost += await stockService.receiveStock(
          line.product,
          line.warehouse,
          line.quantity,
          0,
          { refType: REF.SALE_RETURN, refNo: number, date: when },
          line.cost,
          transaction,
        );
    const row = await SaleReturn.create(
      {
        number,
        sale: sale.id,
        saleNumber: sale.number,
        customer: sale.customer,
        customerName: sale.customerName,
        date: when,
        subtotal,
        discount,
        tax,
        total,
        cost,
        note: String(input.note || '').trim(),
        createdBy: actorId(actor),
      },
      { transaction },
    );
    await SaleReturnItem.bulkCreate(
      lines.map((line, position) => ({ ...line, saleReturnId: row.id, position })),
      { transaction },
    );
    await sale.increment('returnedTotal', { by: total, transaction });
    const reverse = [];
    if (net > 0) reverse.push(journalService.line(ACCOUNT.SALES, { debit: net }));
    if (tax > 0) reverse.push(journalService.line(ACCOUNT.TAX, { debit: tax }));
    if (total > 0)
      reverse.push(journalService.line(ACCOUNT.AR, { credit: total, ref: sale.customer }));
    if (reverse.length)
      await journalService.post({
        date: when,
        description: `Return ${number} against sale ${sale.number}`,
        refType: REF.SALE_RETURN,
        refId: row.id,
        refNo: number,
        warehouse: sale.warehouse,
        store: sale.store,
        createdBy: actorId(actor),
        lines: reverse,
        transaction,
      });
    if (cost > 0)
      await journalService.post({
        date: when,
        description: `Inventory restock for return ${number}`,
        refType: REF.SALE_RETURN,
        refId: row.id,
        refNo: number,
        warehouse: sale.warehouse,
        store: sale.store,
        createdBy: actorId(actor),
        lines: [
          journalService.line(ACCOUNT.INVENTORY, { debit: cost }),
          journalService.line(ACCOUNT.COGS, { credit: cost }),
        ],
        transaction,
      });
    const full = await load(row.id, transaction);
    await gatePassService.createGatePassesForReturn(full, sale, transaction);
    return load(row.id, transaction);
  });
}
const listReturnsForSale = async (saleId) => {
  const rows = await SaleReturn.findAll({
    where: { sale: saleId },
    order: [['createdAt', 'DESC']],
  });
  return Promise.all(rows.map((row) => load(row.id)));
};
async function listReturns(args = {}) {
  const { page, limit, skip: offset } = parsePagination(args);
  const where = {};
  if (args.customer) where.customer = args.customer;
  if (args.from || args.to) {
    where.date = {};
    if (args.from) where.date[Op.gte] = new Date(args.from);
    if (args.to) where.date[Op.lte] = new Date(args.to);
  }
  if (args.search)
    where[Op.or] = ['number', 'saleNumber', 'customerName'].map((field) => ({
      [field]: { [Op.iLike]: `%${args.search}%` },
    }));
  const { rows, count } = await SaleReturn.findAndCountAll({
    where,
    order: [
      ['date', 'DESC'],
      ['createdAt', 'DESC'],
    ],
    offset,
    limit,
  });
  return { returns: await Promise.all(rows.map((row) => load(row.id))), total: count, page, limit };
}
module.exports = { createReturn, listReturnsForSale, listReturns };
