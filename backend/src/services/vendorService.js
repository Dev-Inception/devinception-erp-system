const { Op } = require('sequelize');
const { getPostgres } = require('../db/postgres');
const { initializeModels } = require('../db/models');
const ApiError = require('../utils/ApiError');
const journalService = require('./journalService');
const { ACCOUNT, REF } = require('../utils/finance');
const { toRupees, toPaisa } = require('../utils/money');
const { parsePagination } = require('../utils/query');
const {
  requireWriteStore,
  resolveStoreScope,
  storeWhere,
  assertStoreAccess,
} = require('../utils/storeScope');

/**
 * Vendor (supplier) management. Authorization is enforced by route
 * middleware; here we enforce the data rules. `outstanding` is intentionally
 * never accepted from the client, and the stored column (kept only for
 * schema parity with the old Mongo model) is never trusted for a balance
 * check either — the live payable is always read from the ledger.
 */

// Escapes ILIKE wildcards so a search term is matched literally.
function escapeLike(str) {
  return String(str).replace(/[\\%_]/g, '\\$&');
}

// Whitelist the fields a client may set, so `outstanding` (and anything else)
// can't be injected through the request body.
function pickWritable({ name, phone, email, ntn, address }) {
  const fields = { name, phone, email, ntn, address };
  // Drop undefined so a partial update only touches provided fields.
  Object.keys(fields).forEach((k) => fields[k] === undefined && delete fields[k]);
  return fields;
}

async function listVendors(query = {}) {
  const { Vendor } = initializeModels();
  // The GP vendor picker and the Vendors page consume the full list (no
  // pagination UI), so allow a far larger page size than the default cap.
  const { page, limit, skip } = parsePagination(query, { defaultLimit: 1000, maxLimit: 100000 });
  const { storeIds } = await resolveStoreScope({ store: query.store, actor: query.actor });
  const where = { ...storeWhere(storeIds) };
  if (query.search) {
    const term = `%${escapeLike(query.search)}%`;
    where[Op.or] = [
      { name: { [Op.iLike]: term } },
      { phone: { [Op.iLike]: term } },
      { email: { [Op.iLike]: term } },
    ];
  }

  const [docs, total, balances] = await Promise.all([
    Vendor.findAll({ where, order: [['createdAt', 'DESC']], offset: skip, limit }),
    Vendor.count({ where }),
    journalService.balancesByRef(ACCOUNT.AP, { store: storeIds }),
  ]);

  // Replace the (legacy) stored outstanding with the live payable from the
  // ledger, in rupees, so the list matches the partner's statement.
  const vendors = docs.map((v) => {
    const json = v.toJSON();
    return { ...json, outstanding: toRupees(balances.get(json._id) || 0) };
  });

  return { vendors, total, page, limit };
}

async function getVendorById(actor, id) {
  const { Vendor } = initializeModels();
  const vendor = await Vendor.findByPk(id);
  if (!vendor) throw ApiError.notFound('Vendor not found');
  assertStoreAccess(actor, vendor.store);
  return vendor;
}

/**
 * Posts a balance movement for a vendor that isn't a real purchase/payment —
 * an opening balance at creation, or a later correction from the edit form.
 * The ledger is append-only (see journalService.post), so this never rewrites
 * anything already posted; instead `weOwe`/`theyOwe` are read as the balance
 * the caller wants the vendor to *end up at* (their net, weOwe − theyOwe),
 * and only the difference from the vendor's current balance is posted — so
 * the edit form can safely prefill these fields with the current balance and
 * re-save it unchanged without double-posting anything. Always posts against
 * the vendor's own store (a vendor now belongs to exactly one store).
 *
 * Both fields being `undefined` is the "do you actually want to touch the
 * balance" signal: the caller (see createVendor/updateVendor) only supplies
 * them when the frontend determined a balance change was intended — their
 * absence always means "leave the balance alone," never "set it to zero".
 *
 *   net > current balance -> Dr Equity / Cr AP  (we now owe more)
 *   net < current balance -> Dr AP / Cr Equity  (moves toward them owing us)
 */
async function postVendorBalanceAdjustment(actor, vendor, { weOwe, theyOwe }, description) {
  if (weOwe === undefined && theyOwe === undefined) return;
  assertStoreAccess(actor, vendor.store);

  await getPostgres().transaction(async (transaction) => {
    const desiredNet = toPaisa(weOwe || 0) - toPaisa(theyOwe || 0);
    const currentNet = await journalService.accountBalance(ACCOUNT.AP, vendor.id, {
      store: vendor.store,
      transaction,
    });
    const delta = desiredNet - currentNet;
    if (delta === 0) return;

    const amt = Math.abs(delta);
    const weOweMore = delta > 0;
    await journalService.post({
      description,
      refType: REF.OPENING,
      refId: vendor.id,
      store: vendor.store,
      createdBy: actor ? actor.id : null,
      transaction,
      lines: weOweMore
        ? [
            journalService.line(ACCOUNT.EQUITY, { debit: amt }),
            journalService.line(ACCOUNT.AP, { credit: amt, ref: vendor.id }),
          ]
        : [
            journalService.line(ACCOUNT.AP, { debit: amt, ref: vendor.id }),
            journalService.line(ACCOUNT.EQUITY, { credit: amt }),
          ],
    });
  });
}

/**
 * Creates a vendor, optionally seeding a pre-existing balance for one
 * already carrying a payable/receivable from before this system was in use
 * — e.g. an existing business being onboarded.
 */
async function createVendor(actor, { weOweAmount, theyOweAmount, store, ...data }) {
  const { Store, Vendor } = initializeModels();
  const storeId = requireWriteStore(actor, store);
  const storeDoc = await Store.findByPk(storeId);
  if (!storeDoc) throw ApiError.badRequest('Store not found');

  const vendor = await Vendor.create({ ...pickWritable(data), store: storeDoc.id });
  await postVendorBalanceAdjustment(
    actor,
    vendor,
    { weOwe: weOweAmount, theyOwe: theyOweAmount },
    `Opening balance: ${vendor.name}`,
  );
  return vendor;
}

/**
 * Updates a vendor's profile fields, and optionally moves its balance to a
 * new net figure (see postVendorBalanceAdjustment) — the edit form prefills
 * `weOweAmount`/`theyOweAmount` from the vendor's current balance, so this
 * behaves like editing a normal field: only the actual change posts. The
 * vendor's own store never changes on update.
 */
async function updateVendor(actor, id, { weOweAmount, theyOweAmount, ...data }) {
  const vendor = await getVendorById(actor, id);
  Object.assign(vendor, pickWritable(data));
  await vendor.save();
  await postVendorBalanceAdjustment(
    actor,
    vendor,
    { weOwe: weOweAmount, theyOwe: theyOweAmount },
    `Balance adjustment: ${vendor.name}`,
  );
  return vendor;
}

async function deleteVendor(actor, id) {
  const vendor = await getVendorById(actor, id);
  const balance = await journalService.accountBalance(ACCOUNT.AP, vendor.id);
  if (balance > 0) {
    throw ApiError.badRequest('Vendor has an outstanding balance and cannot be deleted');
  }
  await vendor.destroy();
}

module.exports = {
  listVendors,
  getVendorById,
  createVendor,
  updateVendor,
  deleteVendor,
};
