const Warehouse = require("../models/warehouseModel");
const StockLevel = require("../models/stockLevelModel");
const ApiError = require("../utils/ApiError");

/**
 * Warehouse CRUD. Exactly one warehouse carries isDefault=true; setting it on
 * one clears it on the others.
 */

// Warehouses with the count of in-stock products and total stock value (paisa)
// each holds, for the Warehouses screen cards.
async function listWarehouses() {
  const [warehouses, stock] = await Promise.all([
    Warehouse.find().sort({ createdAt: 1 }).lean(),
    StockLevel.aggregate([
      { $match: { quantity: { $gt: 0 } } },
      {
        $group: {
          _id: "$warehouse",
          itemsInStock: { $sum: 1 },
          stockValue: { $sum: { $round: [{ $multiply: ["$quantity", "$avgCost"] }, 0] } },
        },
      },
    ]),
  ]);
  const byId = new Map(stock.map((s) => [String(s._id), s]));
  return warehouses.map((w) => {
    const s = byId.get(String(w._id));
    return { ...w, itemsInStock: s ? s.itemsInStock : 0, stockValue: s ? s.stockValue : 0 };
  });
}

async function getWarehouseById(id) {
  const wh = await Warehouse.findById(id);
  if (!wh) throw ApiError.notFound("Warehouse not found");
  return wh;
}

async function createWarehouse({ name, location, address, isDefault, isActive }) {
  const wh = await Warehouse.create({ name, location, address, isDefault: !!isDefault, isActive });
  if (wh.isDefault) {
    await Warehouse.updateMany({ _id: { $ne: wh._id } }, { isDefault: false });
  } else if ((await Warehouse.countDocuments()) === 1) {
    // First warehouse is always the default.
    wh.isDefault = true;
    await wh.save();
  }
  return wh;
}

async function updateWarehouse(id, { name, location, address, isDefault, isActive }) {
  const wh = await getWarehouseById(id);
  if (name !== undefined) wh.name = name;
  if (location !== undefined) wh.location = location;
  if (address !== undefined) wh.address = address;
  if (isActive !== undefined) wh.isActive = isActive;
  if (isDefault === true) {
    wh.isDefault = true;
    await Warehouse.updateMany({ _id: { $ne: wh._id } }, { isDefault: false });
  }
  await wh.save();
  return wh;
}

async function deleteWarehouse(id) {
  const wh = await getWarehouseById(id);
  if (wh.isDefault) throw ApiError.badRequest("The default warehouse cannot be deleted");

  const hasStock = await StockLevel.exists({ warehouse: id, quantity: { $ne: 0 } });
  if (hasStock) throw ApiError.badRequest("Warehouse still holds stock and cannot be deleted");

  // Drop leftover zero-quantity stock rows so no orphans linger.
  await StockLevel.deleteMany({ warehouse: id });
  await wh.deleteOne();
}

module.exports = {
  listWarehouses,
  getWarehouseById,
  createWarehouse,
  updateWarehouse,
  deleteWarehouse,
};
