const mongoose = require('mongoose');
const Store = require('../models/storeModel');
const ApiError = require('../utils/ApiError');

/**
 * Resolves an optional `store` (takes precedence) or `warehouse` filter param
 * down to a plain list of warehouse ids — "viewing Store X" means "warehouse
 * is one of X's warehouses". Returns `{ warehouseIds: null }` ("everything")
 * on missing/invalid input, same degrade-to-unscoped behavior the single-
 * warehouse filters this generalizes always had. An empty array is a valid,
 * different result (a real store with no warehouses assigned yet — matches
 * nothing, not everything).
 */
async function resolveWarehouseScope({ store, warehouse } = {}) {
  if (store && mongoose.isValidObjectId(store)) {
    const doc = await Store.findById(store).select('warehouses').lean();
    if (!doc) throw ApiError.notFound('Store not found');
    return { warehouseIds: doc.warehouses.map(String) };
  }
  if (warehouse && mongoose.isValidObjectId(warehouse)) {
    return { warehouseIds: [String(warehouse)] };
  }
  return { warehouseIds: null };
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

module.exports = { resolveWarehouseScope, warehouseMongoFilter };
