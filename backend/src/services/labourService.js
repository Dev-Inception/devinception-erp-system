const { Op, QueryTypes } = require('sequelize');
const { getPostgres } = require('../db/postgres');
const { initializeModels } = require('../db/models');
const ApiError = require('../utils/ApiError');
const journalService = require('./journalService');
const { ACCOUNT, REF } = require('../utils/finance');
const { toPaisa } = require('../utils/money');
const { parsePagination } = require('../utils/query');
const { parseReportDate } = require('../utils/reportDate');
const {
  requireWriteStore,
  resolveStoreScope,
  storeWhere,
  assertStoreAccess,
} = require('../utils/storeScope');

// Overlays each labourer's live payable balance (rent charged on sales that
// hasn't been paid out yet) — same pattern as vendorService.listVendors.
async function listLabour(query = {}) {
  const { Labour } = initializeModels();
  const { storeIds } = await resolveStoreScope({ store: query.store, actor: query.actor });
  const where = storeWhere(storeIds);
  const [docs, balances] = await Promise.all([
    Labour.findAll({ where, order: [['createdAt', 'DESC']] }),
    journalService.balancesByRef(ACCOUNT.AP_LABOUR, { store: storeIds }),
  ]);
  return docs.map((l) => {
    const json = l.toJSON();
    return { ...json, outstanding: balances.get(json._id) || 0 };
  });
}

async function getLabourById(actor, id) {
  const { Labour } = initializeModels();
  const labour = await Labour.findByPk(id);
  if (!labour) throw ApiError.notFound('Labour not found');
  assertStoreAccess(actor, labour.store);
  return labour;
}

async function createLabour(actor, { name, phoneNumber, store }) {
  const { Store, Labour } = initializeModels();
  const storeId = requireWriteStore(actor, store);
  const storeDoc = await Store.findByPk(storeId);
  if (!storeDoc) throw ApiError.badRequest('Store not found');

  // Check for duplicate phone number within this store
  const existing = await Labour.findOne({ where: { store: storeDoc.id, phoneNumber } });
  if (existing) throw ApiError.conflict('Labour with this phone number already exists');

  return Labour.create({ name, phoneNumber, store: storeDoc.id });
}

async function updateLabour(actor, id, { name, phoneNumber }) {
  const { Labour } = initializeModels();
  const labour = await getLabourById(actor, id);

  // Check if phone number is being changed and already exists in this store
  if (phoneNumber && phoneNumber !== labour.phoneNumber) {
    const existing = await Labour.findOne({ where: { store: labour.store, phoneNumber } });
    if (existing) throw ApiError.conflict('Labour with this phone number already exists');
    labour.phoneNumber = phoneNumber;
  }

  if (name) labour.name = name;

  await labour.save();
  return labour;
}

async function deleteLabour(actor, id) {
  const labour = await getLabourById(actor, id);
  await labour.destroy();
  return labour;
}

/**
 * Resolves a raw `labour` input — either a plain array of labour ids, or
 * `{ labour, service, rent }` objects when each labourer has a per-job
 * charge attached — into snapshot line items
 * `{ labour, name, phoneNumber, service, serviceName, rent }` (rent in
 * paisa). Shared by any flow that charges labour on a document (POS sales,
 * stock receiving).
 *
 * Unlike a plain labour id (deduped by document), `service` entries are NOT
 * deduped — a POS sale attaches one line per (labour, service) pair, so the
 * same labourer can appear more than once, each line billing a different
 * service. Stock receiving doesn't pass `service` at all, so it keeps
 * getting exactly one line per labourer, same as before.
 */
async function resolveLabourLines(labourInput, storeId, transaction) {
  const { Labour, LabourService } = initializeModels();
  const input = Array.isArray(labourInput) ? labourInput : [];
  const entries = input
    .map((l) => (l && typeof l === 'object' ? l : { labour: l }))
    .filter((l) => l.labour);

  const labourIds = Array.from(new Set(entries.map((l) => String(l.labour))));
  const labourDocs = labourIds.length
    ? await Labour.findAll({ where: { id: { [Op.in]: labourIds } }, transaction })
    : [];
  if (
    labourDocs.length !== labourIds.length ||
    labourDocs.some((doc) => String(doc.store) !== String(storeId))
  ) {
    throw ApiError.badRequest('One or more labour entries are invalid');
  }
  const labourById = new Map(labourDocs.map((doc) => [String(doc.id), doc]));

  const serviceIds = Array.from(
    new Set(entries.map((l) => (l.service ? String(l.service) : null)).filter(Boolean)),
  );
  const serviceDocs = serviceIds.length
    ? await LabourService.findAll({ where: { id: { [Op.in]: serviceIds } }, transaction })
    : [];
  if (
    serviceDocs.length !== serviceIds.length ||
    serviceDocs.some((doc) => String(doc.store) !== String(storeId))
  ) {
    throw ApiError.badRequest('One or more labour services are invalid');
  }
  const serviceById = new Map(serviceDocs.map((doc) => [String(doc.id), doc]));

  return entries.map((l) => {
    const doc = labourById.get(String(l.labour));
    const serviceDoc = l.service ? serviceById.get(String(l.service)) : null;
    return {
      labour: doc.id,
      name: doc.name,
      phoneNumber: doc.phoneNumber,
      service: serviceDoc ? serviceDoc.id : null,
      serviceName: serviceDoc ? serviceDoc.name : '',
      rent: toPaisa(l.rent || 0),
    };
  });
}

/**
 * Posts the labour payable for a document's labour lines: Dr Operating
 * Expense (summed rent) / Cr AP_LABOUR per labourer with rent > 0. One
 * balanced entry covering every labourer on the document. `label` names the
 * source document in the entry's description (e.g. "sale", "stock receipt").
 * Must run inside the caller's transaction (see journalService.post).
 */
async function postLabourPayable(
  labourLines,
  { when, refType, refNo, store, actor, label, transaction },
) {
  const withRent = (labourLines || []).filter((l) => l.rent > 0);
  if (withRent.length === 0) return;
  const total = withRent.reduce((s, l) => s + l.rent, 0);
  await journalService.post({
    date: when,
    description: `Labour charges for ${label} ${refNo}`,
    refType,
    refNo,
    store,
    createdBy: actor ? actor.id : null,
    transaction,
    lines: [
      journalService.line(ACCOUNT.OPERATING_EXPENSE, { debit: total }),
      ...withRent.map((l) =>
        journalService.line(ACCOUNT.AP_LABOUR, { credit: l.rent, ref: l.labour }),
      ),
    ],
  });
}

// Mirror of postLabourPayable with debit/credit swapped — used to undo a
// document's original labour payable before an edit (or delete) posts a
// fresh one (or nothing). Must run inside the caller's transaction.
async function reverseLabourPayable(
  labourLines,
  { when, refType, refNo, store, actor, label, transaction },
) {
  const withRent = (labourLines || []).filter((l) => l.rent > 0);
  if (withRent.length === 0) return;
  const total = withRent.reduce((s, l) => s + l.rent, 0);
  await journalService.post({
    date: when,
    description: `Reversal of labour charges for edited ${label} ${refNo}`,
    refType,
    refNo,
    store,
    createdBy: actor ? actor.id : null,
    transaction,
    lines: [
      ...withRent.map((l) =>
        journalService.line(ACCOUNT.AP_LABOUR, { debit: l.rent, ref: l.labour }),
      ),
      journalService.line(ACCOUNT.OPERATING_EXPENSE, { credit: total }),
    ],
  });
}

/**
 * Labour cash flow: for every labour line charged on a sale, what the
 * customer paid for it vs what the labourer is owed, and the difference the
 * store keeps.
 *  - DIRECT-mode sales: the labourer is owed exactly what was charged
 *    (margin 0) — status DIRECT.
 *  - PENDING-mode sales: one SALE_LABOUR pending entity per line — PENDING
 *    until its payout is entered, then PRICED with payout = lineTotal.
 * Stock-receipt labour isn't included: nothing is charged to a customer for
 * it, so it has no inflow side.
 *
 * The summary also carries actual payments made to labourers in the range
 * and the current outstanding AP_LABOUR balance (both across every labour
 * source, since that's what the labour ledger itself shows). Filtering/
 * pagination happen in JS since this only ever runs over one actor's
 * store-scoped rows, same as pendingEntityService.listPendingEntityInvoices.
 * Returns paisa; the controller converts to rupees.
 */
async function labourCashFlow({ actor, store, labour, from, to, status, ...query } = {}) {
  const { page, limit } = parsePagination(query);
  const { storeIds } = await resolveStoreScope({ store, actor });

  const conditions = [];
  const replacements = {};
  if (storeIds) {
    if (storeIds.length === 0) {
      return { rows: [], total: 0, page, limit, summary: emptySummary() };
    }
    conditions.push('s.store_id IN (:storeIds)');
    replacements.storeIds = storeIds;
  }
  if (from) {
    conditions.push('s.date >= :from');
    replacements.from = parseReportDate(from, 'from');
  }
  if (to) {
    conditions.push('s.date <= :to');
    replacements.to = parseReportDate(to, 'to', { endOfDay: true });
  }
  if (labour) {
    conditions.push('lab.labour_id = :labour');
    replacements.labour = labour;
  }
  const where = conditions.length ? `AND ${conditions.join(' AND ')}` : '';

  const all = await getPostgres().query(
    `SELECT * FROM (
       SELECT 'DIRECT' AS status, sl.sale_id AS "saleId", s.number AS "saleNo", s.date,
              s.customer_name AS "customerName", sl.labour_id AS labour_id,
              sl.name AS "labourName", sl.service_name AS "serviceName",
              sl.rent AS charged, sl.rent AS payout, NULL AS "pendingEntityId"
       FROM sale_labour sl
       JOIN sales s ON s.id = sl.sale_id
       WHERE s.labour_pricing_mode = 'DIRECT'
       UNION ALL
       SELECT pe.status, pe.sale_id, pe.source_no, pe.date, s.customer_name, pe.labour_id,
              pe.labour_name, pe.service_name, COALESCE(pe.charged_amount, 0),
              CASE WHEN pe.status = 'PRICED' THEN pe.line_total END, pe.id
       FROM pending_entities pe
       JOIN sales s ON s.id = pe.sale_id
       WHERE pe.source_type = 'SALE_LABOUR'
     ) lab
     JOIN sales s ON s.id = lab."saleId"
     WHERE TRUE ${where}
     ORDER BY lab.date DESC, lab."saleNo" DESC`,
    { replacements, type: QueryTypes.SELECT },
  );

  const rows = all.map((r) => {
    const charged = Number(r.charged) || 0;
    const payout = r.payout === null || r.payout === undefined ? null : Number(r.payout);
    return {
      saleId: r.saleId,
      saleNo: r.saleNo,
      date: r.date,
      customerName: r.customerName,
      labour: r.labour_id,
      labourName: r.labourName,
      serviceName: r.serviceName,
      status: r.status,
      pendingEntityId: r.pendingEntityId,
      charged,
      payout,
      margin: payout === null ? null : charged - payout,
    };
  });

  const summary = emptySummary();
  for (const r of rows) {
    summary.charged += r.charged;
    if (r.payout === null) {
      summary.awaitingCharged += r.charged;
      summary.awaitingCount += 1;
    } else {
      summary.payout += r.payout;
      summary.margin += r.margin;
    }
  }
  const [paid, outstanding] = await Promise.all([
    labourPaymentsTotal({ storeIds, labour, from: replacements.from, to: replacements.to }),
    labour
      ? journalService.accountBalance(ACCOUNT.AP_LABOUR, labour, { store: storeIds || undefined })
      : journalService
          .balancesByRef(ACCOUNT.AP_LABOUR, { store: storeIds || undefined })
          .then((m) => Array.from(m.values()).reduce((a, b) => a + b, 0)),
  ]);
  summary.paidToLabour = paid;
  summary.outstanding = outstanding;

  const filtered = status ? rows.filter((r) => r.status === status) : rows;
  const start = (page - 1) * limit;
  return {
    rows: filtered.slice(start, start + limit),
    total: filtered.length,
    page,
    limit,
    summary,
  };
}

function emptySummary() {
  return {
    charged: 0,
    payout: 0,
    margin: 0,
    awaitingCharged: 0,
    awaitingCount: 0,
    paidToLabour: 0,
    outstanding: 0,
  };
}

// Money actually handed to labourers (Dr AP_LABOUR on a PAYMENT entry) in
// the range — the cash-out side of the labour cash flow.
async function labourPaymentsTotal({ storeIds, labour, from, to }) {
  const conditions = ['jl.account = :account', 'je.ref_type = :refType'];
  const replacements = { account: ACCOUNT.AP_LABOUR, refType: REF.PAYMENT };
  if (storeIds) {
    conditions.push('je.store_id IN (:storeIds)');
    replacements.storeIds = storeIds;
  }
  if (labour) {
    conditions.push('jl.ref_id = :labour');
    replacements.labour = labour;
  }
  if (from) {
    conditions.push('je.date >= :from');
    replacements.from = from;
  }
  if (to) {
    conditions.push('je.date <= :to');
    replacements.to = to;
  }
  const [row] = await getPostgres().query(
    `SELECT COALESCE(SUM(jl.debit), 0) AS paid
     FROM journal_lines jl
     JOIN journal_entries je ON je.id = jl.journal_entry_id
     WHERE ${conditions.join(' AND ')}`,
    { replacements, type: QueryTypes.SELECT },
  );
  return Number(row.paid) || 0;
}

module.exports = {
  labourCashFlow,
  listLabour,
  getLabourById,
  createLabour,
  updateLabour,
  deleteLabour,
  resolveLabourLines,
  postLabourPayable,
  reverseLabourPayable,
};
