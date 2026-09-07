const ApiError = require('./ApiError');

// New products have one owning warehouse. Products created before warehouse
// ownership was introduced have no owner and remain compatible with their
// existing StockLevel rows until they are migrated.
function assertProductWarehouse(product, warehouse) {
  const owner = product && product.warehouse && (product.warehouse._id || product.warehouse);
  const target = warehouse && (warehouse._id || warehouse);
  if (owner && String(owner) !== String(target)) {
    throw ApiError.badRequest(
      `Product ${product.name || product._id} belongs to another warehouse`,
    );
  }
}

module.exports = { assertProductWarehouse };
