/**
 * Stores that share a warehouse effectively share one inventory (see
 * seedPvcPanelInventory.js — a product's `category`/`brand`/`unit` are
 * store-scoped, but the product itself is visible from every store on its
 * warehouse). Seeding a full catalog/labour-service list into *each* such
 * store creates unused duplicate rows that clutter any dropdown listing
 * across stores (only the "first" store's rows ever get referenced by a
 * product). This groups stores by shared warehouse and returns just one
 * canonical store per group — the oldest — so callers only seed once per
 * shared inventory.
 *
 *   const stores = await getCanonicalStores();
 */
const { initializeModels } = require('../db/models');

async function getCanonicalStores() {
  const { Store, StoreWarehouse } = initializeModels();
  const stores = await Store.findAll({
    attributes: ['id', 'name', 'createdAt'],
    order: [['createdAt', 'ASC']],
  });
  const links = await StoreWarehouse.findAll();

  const warehousesByStore = new Map();
  for (const s of stores) warehousesByStore.set(s.id, new Set());
  for (const link of links) {
    warehousesByStore.get(link.storeId)?.add(link.warehouseId);
  }

  const claimedWarehouses = new Set();
  const canonical = [];
  for (const store of stores) {
    const ownWarehouses = warehousesByStore.get(store.id) || new Set();
    const alreadyCovered = [...ownWarehouses].some((w) => claimedWarehouses.has(w));
    if (alreadyCovered) continue;
    canonical.push(store);
    for (const w of ownWarehouses) claimedWarehouses.add(w);
  }
  return canonical;
}

module.exports = { getCanonicalStores };
