const { Op } = require('sequelize');
const { initializeModels } = require('../db/models');
const { isValidId } = require('../db/id');
const ApiError = require('./ApiError');

// A non-super-admin user with a `store` assigned is confined to it; anyone
// else (super admin, or a legacy user with no store yet) is unrestricted.
function actorStoreId(actor) {
  return actor && actor.store ? String(actor.store) : null;
}

// Throws if `actor` is store-restricted and `storeId` isn't their store.
// Call this before creating/reading/mutating anything that belongs to one
// specific store (sales, stock receipts, payments, ...).
function assertStoreAccess(actor, storeId) {
  const restricted = actorStoreId(actor);
  if (restricted && String(storeId) !== restricted) {
    throw ApiError.forbidden('You do not have access to this store');
  }
}

/**
 * Resolves an optional `store` (takes precedence) or `warehouse` filter param
 * down to a plain list of warehouse ids — "viewing Store X" means "warehouse
 * is one of X's warehouses". Returns `{ warehouseIds: null }` ("everything")
 * on missing/invalid input, same degrade-to-unscoped behavior the single-
 * warehouse filters this generalizes always had. An empty array is a valid,
 * different result (a real store with no warehouses assigned yet — matches
 * nothing, not everything).
 *
 * When `actor` is store-restricted, their store always wins over a passed-in
 * `store` id — a scoped user can never widen their own view by passing a
 * different store. An explicit `warehouse` id is still honored on top of
 * that, but only to narrow further: it's kept only when it's actually one of
 * the effective store's own warehouses, so it can never escape the store.
 */
async function resolveWarehouseScope({ store, warehouse, actor, transaction } = {}) {
  const { Store } = initializeModels();
  const restricted = actorStoreId(actor);
  const effectiveStore = restricted || store;

  if (effectiveStore && isValidId(effectiveStore)) {
    const doc = await Store.findByPk(effectiveStore, {
      attributes: ['id'],
      include: [{ association: 'warehouses', attributes: ['id'] }],
      transaction,
    });
    if (!doc) throw ApiError.notFound('Store not found');
    const storeWarehouseIds = doc.warehouses.map((w) => w.id);
    if (warehouse && isValidId(warehouse) && storeWarehouseIds.includes(String(warehouse))) {
      return { warehouseIds: [String(warehouse)] };
    }
    return { warehouseIds: storeWarehouseIds };
  }
  if (!restricted && warehouse && isValidId(warehouse)) {
    return { warehouseIds: [String(warehouse)] };
  }
  // A restricted actor whose own store id didn't resolve gets "nothing",
  // never the unscoped "everything" fallback below.
  return { warehouseIds: restricted ? [] : null };
}

// Sequelize `where` fragment for any model with a `warehouse` attribute
// (Sale, StockReceipt, GatePass, Product, StockLevel, JournalEntry all share
// it), built from a `resolveWarehouseScope` result.
function warehouseWhere(warehouseIds) {
  if (!warehouseIds) return {};
  if (warehouseIds.length === 1) return { warehouse: warehouseIds[0] };
  return { warehouse: { [Op.in]: warehouseIds } };
}

module.exports = { resolveWarehouseScope, warehouseWhere, actorStoreId, assertStoreAccess };
