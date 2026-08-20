const mongoose = require('mongoose');
const Store = require('../models/storeModel');
const ApiError = require('../utils/ApiError');

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
async function resolveWarehouseScope({ store, warehouse, actor } = {}) {
  const restricted = actorStoreId(actor);
  const effectiveStore = restricted || store;

  if (effectiveStore && mongoose.isValidObjectId(effectiveStore)) {
    const doc = await Store.findById(effectiveStore).select('warehouses').lean();
    if (!doc) throw ApiError.notFound('Store not found');
    const storeWarehouseIds = doc.warehouses.map(String);
    if (
      warehouse &&
      mongoose.isValidObjectId(warehouse) &&
      storeWarehouseIds.includes(String(warehouse))
    ) {
      return { warehouseIds: [String(warehouse)] };
    }
    return { warehouseIds: storeWarehouseIds };
  }
  if (!restricted && warehouse && mongoose.isValidObjectId(warehouse)) {
    return { warehouseIds: [String(warehouse)] };
  }
  // A restricted actor whose own store id didn't resolve gets "nothing",
  // never the unscoped "everything" fallback below.
  return { warehouseIds: restricted ? [] : null };
}

// Mongo filter fragment for any model with a `warehouse` field (Sale,
// StockReceipt, GatePass, Product, StockLevel, JournalEntry all share the
// field name), built from a `resolveWarehouseScope` result. Ids are cast to
// ObjectId so this is safe inside `.aggregate()` pipelines too — unlike
// `.find()`, aggregation `$match` does not auto-cast query strings.
function warehouseMongoFilter(warehouseIds) {
  if (!warehouseIds) return {};
  const objectIds = warehouseIds.map((id) => new mongoose.Types.ObjectId(id));
  if (objectIds.length === 1) return { warehouse: objectIds[0] };
  return { warehouse: { $in: objectIds } };
}

module.exports = { resolveWarehouseScope, warehouseMongoFilter, actorStoreId, assertStoreAccess };
