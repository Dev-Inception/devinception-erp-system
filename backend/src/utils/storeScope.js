const { Op } = require('sequelize');
const { initializeModels } = require('../db/models');
const { isValidId } = require('../db/id');
const ApiError = require('./ApiError');
const { ROLES } = require('./constants');

// Returns the store ids `actor` is confined to, or null if unrestricted.
//  - super_admin: always unrestricted (null).
//  - admin: confined to the store(s) they own via store_admins (adminStores,
//    eager-loaded in authMiddleware.protect) — may be an empty array if none
//    are provisioned yet, which means "confined to nothing", not "everything".
//  - everyone else (staff): confined to their single `store`, or unrestricted
//    if they somehow have neither (legacy accounts predating store scoping).
function actorStoreIds(actor) {
  if (!actor) return null;
  if (actor.role === ROLES.SUPER_ADMIN) return null;
  if (actor.role === ROLES.ADMIN) {
    return (actor.adminStores || []).map((s) => String(s.id));
  }
  return actor.store ? [String(actor.store)] : null;
}

// Single-store accessor kept for any caller that only wants "am I confined
// to exactly one store" — returns null otherwise (unrestricted, or confined
// to zero/several stores).
function actorStoreId(actor) {
  const ids = actorStoreIds(actor);
  return ids && ids.length === 1 ? ids[0] : null;
}

// Throws if `actor` is store-restricted and `storeId` isn't one of their
// stores. Call this before creating/reading/mutating anything that belongs
// to one specific store (sales, stock receipts, payments, ...).
function assertStoreAccess(actor, storeId) {
  const restricted = actorStoreIds(actor);
  if (restricted && !restricted.includes(String(storeId))) {
    throw ApiError.forbidden('You do not have access to this store');
  }
}

/**
 * Resolves an optional `store` filter param against the actor's allowed
 * stores:
 *  - unrestricted actor, no `store` given -> { storeIds: null } ("everything")
 *  - unrestricted actor, `store` given    -> { storeIds: [store] } (narrow)
 *  - restricted actor, no `store` given   -> { storeIds: <all their stores> }
 *  - restricted actor, `store` given      -> assertStoreAccess (throws if
 *    not theirs), then { storeIds: [store] }
 * A restricted actor can never widen their view via `store` — only narrow
 * it to one of their own.
 */
async function resolveStoreScope({ store, actor } = {}) {
  const restricted = actorStoreIds(actor);
  if (store && isValidId(store)) {
    assertStoreAccess(actor, store);
    return { storeIds: [String(store)] };
  }
  return { storeIds: restricted };
}

// Sequelize `where` fragment for a `store` column, built from a
// resolveStoreScope result. Mirrors warehouseWhere below.
function storeWhere(storeIds) {
  if (!storeIds) return {};
  if (storeIds.length === 1) return { store: storeIds[0] };
  return { store: { [Op.in]: storeIds } }; // [] -> IN () -> matches nothing
}

// For write paths that must settle on exactly one store at creation time: a
// single-store actor (staff, or a single-store admin) gets it implicitly;
// anyone confined to zero or several stores (a multi-store admin, or an
// unrestricted super admin) must name one explicitly in the request, which
// is validated against their allowed set when restricted.
function requireWriteStore(actor, store) {
  const restricted = actorStoreIds(actor);
  const storeId = restricted && restricted.length === 1 ? restricted[0] : store;
  if (!storeId || !isValidId(storeId)) {
    throw ApiError.badRequest('A store is required');
  }
  assertStoreAccess(actor, storeId);
  return String(storeId);
}

// Like requireWriteStore, but for entities that have a meaningful "no store"
// home of their own (settings, a super-admin-authored global role/category)
// instead of always needing one: a store-restricted actor still must settle
// on exactly one of their own stores, but an unrestricted actor with no
// explicit `store` resolves to `null` (global) rather than throwing.
function resolveOptionalWriteStore(actor, store) {
  const restricted = actorStoreIds(actor);
  if (restricted) {
    const storeId = restricted.length === 1 ? restricted[0] : store;
    if (!storeId || !isValidId(storeId)) {
      throw ApiError.badRequest('Select a store first');
    }
    assertStoreAccess(actor, storeId);
    return String(storeId);
  }
  return store && isValidId(store) ? String(store) : null;
}

/**
 * Resolves an optional `store`/`warehouse` filter down to a plain list of
 * warehouse ids — "viewing Store X" means "warehouse is one of X's
 * warehouses", unioned across every store the actor/filter resolves to.
 * Returns `{ warehouseIds: null }` ("everything") on missing/invalid input
 * for an unrestricted actor. An empty array is a valid, different result (a
 * restricted actor with no stores/warehouses yet) — matches nothing, not
 * everything.
 */
async function resolveWarehouseScope({ store, warehouse, actor, transaction } = {}) {
  const { Store } = initializeModels();
  const { storeIds } = await resolveStoreScope({ store, actor });

  if (storeIds) {
    if (storeIds.length === 0) return { warehouseIds: [] };
    const stores = await Store.findAll({
      where: { id: { [Op.in]: storeIds } },
      attributes: ['id'],
      include: [{ association: 'warehouses', attributes: ['id'] }],
      transaction,
    });
    if (stores.length !== storeIds.length) throw ApiError.notFound('Store not found');
    const union = new Set();
    for (const s of stores) for (const w of s.warehouses) union.add(w.id);
    const storeWarehouseIds = [...union];
    if (warehouse && isValidId(warehouse) && storeWarehouseIds.includes(String(warehouse))) {
      return { warehouseIds: [String(warehouse)] };
    }
    return { warehouseIds: storeWarehouseIds };
  }
  // Unrestricted, no store given.
  if (warehouse && isValidId(warehouse)) {
    return { warehouseIds: [String(warehouse)] };
  }
  return { warehouseIds: null };
}

// Sequelize `where` fragment for any model with a `warehouse` attribute
// (Sale, StockReceipt, GatePass, Product, StockLevel, JournalEntry all share
// it), built from a `resolveWarehouseScope` result.
function warehouseWhere(warehouseIds) {
  if (!warehouseIds) return {};
  if (warehouseIds.length === 1) return { warehouse: warehouseIds[0] };
  return { warehouse: { [Op.in]: warehouseIds } };
}

module.exports = {
  actorStoreId,
  actorStoreIds,
  assertStoreAccess,
  resolveStoreScope,
  storeWhere,
  requireWriteStore,
  resolveOptionalWriteStore,
  resolveWarehouseScope,
  warehouseWhere,
};
