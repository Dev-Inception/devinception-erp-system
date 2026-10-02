const {
  Op,
  QueryTypes,
  fn,
  col,
  literal,
  where: sqlWhere,
  UniqueConstraintError,
} = require('sequelize');
const { getPostgres } = require('../db/postgres');
const { initializeModels } = require('../db/models');
const { isValidId } = require('../db/id');
const ApiError = require('../utils/ApiError');
const { toPaisa, view } = require('../utils/money');
const { ACCOUNT, REF } = require('../utils/finance');
const journalService = require('./journalService');
const counterService = require('./counterService');
const { settlementAccount } = require('./paymentService');
const { parsePagination, escapeLike } = require('../utils/query');
const {
  resolveStoreScope,
  storeWhere,
  requireWriteStore,
  assertStoreAccess,
} = require('../utils/storeScope');
const { ROLES } = require('../utils/constants');
const dayEndService = require('./dayEndService');

const EXPENSE_STATUS = { PENDING: 'PENDING', APPROVED: 'APPROVED', REJECTED: 'REJECTED' };

// Small, everyday spend doesn't need a sign-off — only amounts above this
// (in rupees) go to PENDING and wait for someone with expenses:approve.
const AUTO_APPROVE_THRESHOLD_RUPEES = 1000;

/**
 * Day-to-day operating expenses — food, utility bills, office/equipment
 * upkeep, and anything else that isn't a purchase or a sale. Each create/
 * edit/delete keeps a balanced journal entry in step (Dr Operating Expense /
 * Cr Cash|Bank), the same posting paymentService.recordExpense uses, but as
 * a mutable record with a category, so spend can actually be listed, fixed,
 * and reported by category — a bare journal entry can't do any of that.
 */

// The two built-in categories that pay labour / transport out against a
// sale invoice (db/migrations/028-labour-transport-expenses.js). They always
// exist and are listed first; any other category is user-created.
const SYSTEM_KEY = { LABOUR: 'LABOUR', TRANSPORT: 'TRANSPORT' };

async function listCategories() {
  const { ExpenseCategory } = initializeModels();
  return ExpenseCategory.findAll({
    where: { [Op.or]: [{ isActive: true }, { systemKey: { [Op.ne]: null } }] },
    order: [literal('system_key IS NULL'), ['name', 'ASC']],
  });
}

// Case-insensitive find-or-create by name. Expense categories aren't
// store-scoped (unlike product catalog entries), so this can't reuse
// catalogService.findOrCreateByName — that helper always filters/creates
// against a `store` column, which this model doesn't have.
async function findOrCreateCategory(name, extra = {}) {
  const { ExpenseCategory } = initializeModels();
  const trimmed = String(name || '').trim();
  if (!trimmed) return null;
  const where = sqlWhere(fn('LOWER', col('name')), trimmed.toLowerCase());
  const existing = await ExpenseCategory.findOne({ where });
  if (existing) return existing;
  try {
    return await ExpenseCategory.create({ name: trimmed, ...extra });
  } catch (err) {
    // Lost a create race against the unique index — fetch the winner.
    if (err instanceof UniqueConstraintError) {
      return ExpenseCategory.findOne({ where });
    }
    throw err;
  }
}

async function createCategory(name, description) {
  if (!name || !String(name).trim()) throw ApiError.badRequest('A name is required');
  return findOrCreateCategory(name, { description: (description || '').trim() });
}

async function resolveCategory({ category, categoryName }) {
  const { ExpenseCategory } = initializeModels();
  if (category) {
    if (!isValidId(category)) throw ApiError.badRequest('Invalid category');
    const doc = await ExpenseCategory.findByPk(category);
    if (!doc) throw ApiError.notFound('Expense category not found');
    return doc;
  }
  if (categoryName && categoryName.trim()) {
    return findOrCreateCategory(categoryName);
  }
  throw ApiError.badRequest('A category is required');
}

// For a Labour/Transport expense: the sale invoice it pays for and who was
// paid, both checked to belong to the expense's store. Any other category
// carries none of these.
async function resolvePayout(categoryDoc, input, storeId, transaction) {
  const none = { sale: null, saleNo: '', labour: null, transporter: null, payeeName: '' };
  const key = categoryDoc.systemKey;
  if (key !== SYSTEM_KEY.LABOUR && key !== SYSTEM_KEY.TRANSPORT) return none;

  const { Sale, Labour, Transporter } = initializeModels();
  if (!input.sale || !isValidId(input.sale)) {
    throw ApiError.badRequest('Select the invoice this payment is for');
  }
  const sale = await Sale.findByPk(input.sale, { transaction });
  if (!sale || String(sale.store) !== String(storeId)) {
    throw ApiError.badRequest('Invoice not found in this store');
  }

  if (key === SYSTEM_KEY.LABOUR) {
    if (!input.labour || !isValidId(input.labour)) {
      throw ApiError.badRequest('Select the labourer being paid');
    }
    const labour = await Labour.findByPk(input.labour, { transaction });
    if (!labour || String(labour.store) !== String(storeId)) {
      throw ApiError.badRequest('Labourer not found in this store');
    }
    return {
      ...none,
      sale: sale.id,
      saleNo: sale.number,
      labour: labour.id,
      payeeName: labour.name,
    };
  }

  if (!input.transporter || !isValidId(input.transporter)) {
    throw ApiError.badRequest('Select the transporter being paid');
  }
  const transporter = await Transporter.findByPk(input.transporter, { transaction });
  if (!transporter || String(transporter.store) !== String(storeId)) {
    throw ApiError.badRequest('Transporter not found in this store');
  }
  return {
    ...none,
    sale: sale.id,
    saleNo: sale.number,
    transporter: transporter.id,
    payeeName: transporter.name,
  };
}

async function requireStore(actor, store, transaction) {
  const { Store } = initializeModels();
  const storeId = requireWriteStore(actor, store);
  const storeDoc = await Store.findByPk(storeId, { transaction });
  if (!storeDoc) throw ApiError.badRequest('Store not found');
  return storeDoc;
}

// What the expense reads as in the Day Book. A labour/transport payout names
// who was paid and for which invoice, plus any note.
function expenseDescription(expense) {
  if (expense.payeeName) {
    const base = `${expense.categoryName} paid to ${expense.payeeName} for sale ${expense.saleNo}`;
    return expense.note ? `${base} — ${expense.note}` : base;
  }
  return expense.note || `${expense.categoryName} expense ${expense.number}`;
}

// Dr Operating Expense / Cr Cash|Bank — the ledger effect of an expense
// existing. Shared by create and the repost half of an edit.
async function postExpenseJournal(expense, actor, transaction) {
  const settle = await settlementAccount(
    expense.method,
    expense.bankAccount,
    expense.store,
    transaction,
  );
  const entry = await journalService.post({
    date: expense.date,
    description: expenseDescription(expense),
    refType: REF.EXPENSE,
    refId: expense.id,
    refNo: expense.number,
    warehouse: expense.warehouse,
    store: expense.store,
    createdBy: actor ? actor.id : null,
    transaction,
    lines: [
      journalService.line(ACCOUNT.OPERATING_EXPENSE, { debit: expense.amount }),
      journalService.line(settle.account, { credit: expense.amount, ref: settle.ref }),
    ],
  });
  expense.journalEntry = entry.id;
}

// The exact reverse of postExpenseJournal, against the expense's *current*
// (pre-edit) method/amount — journal entries are append-only, so "undo"
// always means posting the opposite entry, never touching the original.
async function reverseExpenseJournal(expense, actor, transaction) {
  const settle = await settlementAccount(
    expense.method,
    expense.bankAccount,
    expense.store,
    transaction,
  );
  await journalService.post({
    date: new Date(),
    description: `Reversal of expense ${expense.number}`,
    refType: REF.EXPENSE,
    refId: expense.id,
    refNo: expense.number,
    warehouse: expense.warehouse,
    store: expense.store,
    createdBy: actor ? actor.id : null,
    transaction,
    lines: [
      journalService.line(settle.account, { debit: expense.amount, ref: settle.ref }),
      journalService.line(ACCOUNT.OPERATING_EXPENSE, { credit: expense.amount }),
    ],
  });
}

async function reloadWithAssociations(id, transaction) {
  const { Expense, ExpenseCategory, Store } = initializeModels();
  return Expense.findByPk(id, {
    include: [
      { model: ExpenseCategory, as: 'categoryInfo', attributes: ['id', 'name'] },
      { model: Store, as: 'storeInfo', attributes: ['id', 'name', 'code'] },
    ],
    transaction,
  });
}

async function createExpense(actor, input) {
  const { amount, method, bankAccount, warehouse, date, note } = input;
  // Catalog resolution isn't part of the financial atomicity story (it's
  // idempotent, shared reference data), so it happens before the transaction,
  // same as the original Mongo flow.
  const categoryDoc = await resolveCategory(input);

  return getPostgres().transaction(async (transaction) => {
    const { Expense } = initializeModels();
    const storeDoc = await requireStore(actor, input.store, transaction);

    const amt = toPaisa(amount);
    if (amt <= 0) throw ApiError.badRequest('Amount must be positive');
    if (!method) throw ApiError.badRequest('A payment method is required');

    const when = await dayEndService.businessTimestamp(
      storeDoc.id,
      date ? new Date(date) : new Date(),
      transaction,
    );
    const number = await counterService.nextDocNumber('EXP', when.getFullYear(), 6, transaction);
    const payout = await resolvePayout(categoryDoc, input, storeDoc.id, transaction);

    const expense = Expense.build({
      ...payout,
      number,
      category: categoryDoc.id,
      categoryName: categoryDoc.name,
      amount: amt,
      method,
      bankAccount: bankAccount || null,
      store: storeDoc.id,
      warehouse: warehouse || null,
      date: when,
      note: (note || '').trim(),
      createdBy: actor ? actor.id : null,
    });

    // A super admin's own entry needs no one else's sign-off, and neither
    // do labour/transport payouts or small day-to-day spend (at or under the
    // auto-approve threshold). Anything else stays PENDING — no journal effect — until
    // someone with expenses:approve signs off (see approveExpense below).
    // Labour / Transport payouts against a sale invoice are always
    // auto-approved, whatever the amount.
    const autoApprove =
      (actor && actor.role === ROLES.SUPER_ADMIN) ||
      Boolean(categoryDoc.systemKey) ||
      amt <= toPaisa(AUTO_APPROVE_THRESHOLD_RUPEES);
    if (autoApprove) {
      expense.status = EXPENSE_STATUS.APPROVED;
      expense.approvedBy = actor ? actor.id : null;
      expense.approvedAt = new Date();
      await expense.save({ transaction });
      await postExpenseJournal(expense, actor, transaction);
    }

    await expense.save({ transaction });
    return reloadWithAssociations(expense.id, transaction);
  });
}

async function getExpenseById(actor, id) {
  const expense = await reloadWithAssociations(id);
  if (!expense) throw ApiError.notFound('Expense not found');
  assertStoreAccess(actor, expense.store);
  return expense;
}

async function updateExpense(actor, id, input) {
  return getPostgres().transaction(async (transaction) => {
    const { Expense } = initializeModels();
    const expense = await Expense.findByPk(id, { transaction, lock: transaction.LOCK.UPDATE });
    if (!expense) throw ApiError.notFound('Expense not found');
    assertStoreAccess(actor, expense.store);
    if (expense.status === EXPENSE_STATUS.REJECTED) {
      throw ApiError.badRequest('A rejected expense cannot be edited');
    }

    const { amount, method, bankAccount, warehouse, date, note } = input;
    const categoryDoc = await resolveCategory(input);

    // A PENDING expense has no journal entry yet, so there is nothing to
    // reverse — only an already-APPROVED one needs the old ledger effect
    // undone before the revised one is posted (never edit the entry itself).
    const wasApproved = expense.status === EXPENSE_STATUS.APPROVED;
    if (wasApproved) {
      await reverseExpenseJournal(expense, actor, transaction);
    }

    const amt = amount !== undefined ? toPaisa(amount) : expense.amount;
    if (amt <= 0) throw ApiError.badRequest('Amount must be positive');

    const payout = await resolvePayout(categoryDoc, input, expense.store, transaction);
    Object.assign(expense, payout);
    expense.category = categoryDoc.id;
    expense.categoryName = categoryDoc.name;
    expense.amount = amt;
    expense.method = method || expense.method;
    expense.bankAccount = bankAccount !== undefined ? bankAccount || null : expense.bankAccount;
    expense.warehouse = warehouse !== undefined ? warehouse || null : expense.warehouse;
    expense.date = date ? new Date(date) : expense.date;
    expense.note = note !== undefined ? note.trim() : expense.note;

    if (wasApproved) {
      await postExpenseJournal(expense, actor, transaction);
    }
    await expense.save({ transaction });
    return reloadWithAssociations(expense.id, transaction);
  });
}

async function deleteExpense(actor, id) {
  return getPostgres().transaction(async (transaction) => {
    const { Expense } = initializeModels();
    const expense = await Expense.findByPk(id, { transaction, lock: transaction.LOCK.UPDATE });
    if (!expense) throw ApiError.notFound('Expense not found');
    assertStoreAccess(actor, expense.store);

    if (expense.status === EXPENSE_STATUS.APPROVED) {
      await reverseExpenseJournal(expense, actor, transaction);
    }
    await expense.destroy({ transaction });
  });
}

// Super-admin-only sign-off — posts the Dr Operating Expense / Cr Cash|Bank
// entry that createExpense skipped for a non-super-admin creator. Also
// covers reversing an earlier reject: a super admin can change their mind
// either direction, so PENDING and REJECTED both post fresh here (REJECTED
// never had a journal entry to begin with, same as PENDING).
async function approveExpense(actor, id) {
  return getPostgres().transaction(async (transaction) => {
    const { Expense } = initializeModels();
    const expense = await Expense.findByPk(id, { transaction, lock: transaction.LOCK.UPDATE });
    if (!expense) throw ApiError.notFound('Expense not found');
    assertStoreAccess(actor, expense.store);
    if (expense.status === EXPENSE_STATUS.APPROVED) {
      throw ApiError.badRequest('Expense is already approved');
    }

    await postExpenseJournal(expense, actor, transaction);
    expense.status = EXPENSE_STATUS.APPROVED;
    expense.approvedBy = actor.id;
    expense.approvedAt = new Date();
    expense.rejectedBy = null;
    expense.rejectedAt = null;
    expense.rejectionReason = '';
    await expense.save({ transaction });
    return reloadWithAssociations(expense.id, transaction);
  });
}

// Rejecting a still-PENDING expense never touched the books — pure status
// change. Rejecting a previously-APPROVED one (the super admin reversing
// their own sign-off) must undo that ledger effect first — a REJECTED
// expense always has no journal effect, regardless of history.
async function rejectExpense(actor, id, reason) {
  return getPostgres().transaction(async (transaction) => {
    const { Expense } = initializeModels();
    const expense = await Expense.findByPk(id, { transaction, lock: transaction.LOCK.UPDATE });
    if (!expense) throw ApiError.notFound('Expense not found');
    assertStoreAccess(actor, expense.store);
    if (expense.status === EXPENSE_STATUS.REJECTED) {
      throw ApiError.badRequest('Expense is already rejected');
    }

    if (expense.status === EXPENSE_STATUS.APPROVED) {
      await reverseExpenseJournal(expense, actor, transaction);
      expense.journalEntry = null;
    }

    expense.status = EXPENSE_STATUS.REJECTED;
    expense.rejectedBy = actor.id;
    expense.rejectedAt = new Date();
    expense.rejectionReason = (reason || '').trim();
    expense.approvedBy = null;
    expense.approvedAt = null;
    await expense.save({ transaction });
    return reloadWithAssociations(expense.id, transaction);
  });
}

async function listExpenses({ category, store, from, to, search, status, actor, ...query } = {}) {
  const { Expense, ExpenseCategory, Store } = initializeModels();
  const { page, limit, skip } = parsePagination(query);
  const where = {};

  const { storeIds } = await resolveStoreScope({ store, actor });
  Object.assign(where, storeWhere(storeIds));
  if (category && isValidId(category)) where.category = category;
  if (status && Object.values(EXPENSE_STATUS).includes(status)) where.status = status;
  if (from || to) {
    where.date = {};
    if (from) where.date[Op.gte] = new Date(from);
    if (to) where.date[Op.lte] = new Date(to);
  }
  if (search) {
    const term = `%${escapeLike(search)}%`;
    where[Op.or] = [
      { number: { [Op.iLike]: term } },
      { categoryName: { [Op.iLike]: term } },
      { note: { [Op.iLike]: term } },
      { saleNo: { [Op.iLike]: term } },
      { payeeName: { [Op.iLike]: term } },
    ];
  }

  const [{ rows, count }, [totalRow]] = await Promise.all([
    Expense.findAndCountAll({
      where,
      include: [
        { model: ExpenseCategory, as: 'categoryInfo', attributes: ['id', 'name'] },
        { model: Store, as: 'storeInfo', attributes: ['id', 'name', 'code'] },
      ],
      order: [
        ['date', 'DESC'],
        ['createdAt', 'DESC'],
      ],
      offset: skip,
      limit,
    }),
    Expense.findAll({
      where,
      attributes: [[fn('COALESCE', fn('SUM', col('amount')), 0), 'total']],
      raw: true,
    }),
  ]);

  return { expenses: rows, total: count, page, limit, totalAmount: totalRow ? totalRow.total : 0 };
}

// Spend grouped by category over a range — the "what are we actually
// spending on" view.
async function categoryTotals({ store, from, to, actor } = {}) {
  const conditions = [`status = 'APPROVED'`];
  const replacements = {};
  const { storeIds } = await resolveStoreScope({ store, actor });
  if (storeIds) {
    conditions.push('store_id IN (:storeIds)');
    replacements.storeIds = storeIds;
  }
  // Only money that has actually posted counts as "what we're spending" —
  // a still-PENDING expense hasn't touched the books yet.
  if (from) {
    conditions.push('date >= :from');
    replacements.from = new Date(from);
  }
  if (to) {
    conditions.push('date <= :to');
    replacements.to = new Date(to);
  }

  const rows = await getPostgres().query(
    `SELECT category_id AS "categoryId", MIN(category_name) AS "categoryName", SUM(amount) AS total
     FROM expenses
     WHERE ${conditions.join(' AND ')}
     GROUP BY category_id
     ORDER BY total DESC`,
    { replacements, type: QueryTypes.SELECT },
  );
  return rows.map((r) =>
    view({ categoryId: r.categoryId, categoryName: r.categoryName, total: r.total }, ['total']),
  );
}

// Invoice # search for a Labour/Transport expense: this store's sales that
// charged the customer for labour (or transport), newest first, each with
// what was charged and what has already been paid out against it (any
// non-rejected expense of that kind). Labour sales also list their services.
async function listPayableSales({ actor, store, kind, search }) {
  const { Sale, SaleLabour, Expense, ExpenseCategory } = initializeModels();
  const { storeIds } = await resolveStoreScope({ store, actor });
  const where = { ...storeWhere(storeIds) };
  if (kind === SYSTEM_KEY.LABOUR) where.labourRent = { [Op.gt]: 0 };
  else if (kind === SYSTEM_KEY.TRANSPORT) where.transportFare = { [Op.gt]: 0 };
  else throw ApiError.badRequest('Invalid payout kind');
  if (search) where.number = { [Op.iLike]: `%${escapeLike(search)}%` };

  const sales = await Sale.findAll({
    where,
    attributes: ['id', 'number', 'date', 'customerName', 'labourRent', 'transportFare'],
    order: [['date', 'DESC']],
    limit: 20,
  });
  if (sales.length === 0) return [];
  const saleIds = sales.map((s) => s.id);

  const paidRows = await Expense.findAll({
    where: { sale: { [Op.in]: saleIds }, status: { [Op.ne]: EXPENSE_STATUS.REJECTED } },
    include: [
      {
        model: ExpenseCategory,
        as: 'categoryInfo',
        attributes: [],
        where: { systemKey: kind },
      },
    ],
    attributes: ['sale', [fn('SUM', col('amount')), 'paid']],
    group: ['Expense.sale_id'],
    raw: true,
  });
  const paidBySale = new Map(paidRows.map((r) => [String(r.sale), Number(r.paid) || 0]));

  const servicesBySale = new Map();
  if (kind === SYSTEM_KEY.LABOUR) {
    const lines = await SaleLabour.findAll({
      where: { saleId: { [Op.in]: saleIds } },
      order: [['position', 'ASC']],
    });
    for (const l of lines) {
      const key = String(l.saleId);
      if (!servicesBySale.has(key)) servicesBySale.set(key, []);
      servicesBySale.get(key).push({ serviceName: l.serviceName, name: l.name, rent: l.rent });
    }
  }

  return sales.map((s) =>
    view(
      {
        id: s.id,
        number: s.number,
        date: s.date,
        customerName: s.customerName,
        charged: kind === SYSTEM_KEY.LABOUR ? s.labourRent : s.transportFare,
        paid: paidBySale.get(String(s.id)) || 0,
        services: (servicesBySale.get(String(s.id)) || []).map((l) => view(l, ['rent'])),
      },
      ['charged', 'paid'],
    ),
  );
}

// Every labour/transport payout (non-rejected expense) made to one labourer
// or transporter — "which jobs did they do, and what did we pay" on their
// detail page. Newest first. Amounts in rupees.
async function listPayeePayments({ actor, labour, transporter }) {
  const { Expense, Sale } = initializeModels();
  const { storeIds } = await resolveStoreScope({ actor });
  const where = { ...storeWhere(storeIds), status: { [Op.ne]: EXPENSE_STATUS.REJECTED } };
  if (labour) where.labour = labour;
  else if (transporter) where.transporter = transporter;
  else throw ApiError.badRequest('A labourer or transporter is required');

  const rows = await Expense.findAll({
    where,
    order: [
      ['date', 'DESC'],
      ['createdAt', 'DESC'],
    ],
  });
  const saleIds = Array.from(new Set(rows.map((r) => r.sale).filter(Boolean)));
  const sales = saleIds.length
    ? await Sale.findAll({
        where: { id: { [Op.in]: saleIds } },
        attributes: ['id', 'date', 'customerName'],
      })
    : [];
  const saleById = new Map(sales.map((s) => [String(s.id), s]));

  return rows.map((r) => {
    const sale = r.sale ? saleById.get(String(r.sale)) : null;
    return view(
      {
        id: r.id,
        number: r.number,
        paidOn: r.date,
        saleId: r.sale,
        saleNo: r.saleNo,
        saleDate: sale ? sale.date : null,
        customerName: sale ? sale.customerName : '',
        amount: r.amount,
        method: r.method,
        status: r.status,
        note: r.note,
      },
      ['amount'],
    );
  });
}

module.exports = {
  SYSTEM_KEY,
  listPayableSales,
  listPayeePayments,
  listCategories,
  createCategory,
  createExpense,
  getExpenseById,
  updateExpense,
  deleteExpense,
  approveExpense,
  rejectExpense,
  listExpenses,
  categoryTotals,
};
