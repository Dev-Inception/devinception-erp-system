const { DataTypes } = require('sequelize');
const { id, money, quantity, defineModel } = require('./helpers');

module.exports = function defineProduct(db) {
  return defineModel(
    db,
    'Product',
    {
      id: id(),
      name: { type: DataTypes.STRING(160), allowNull: false },
      sku: {
        type: DataTypes.STRING(60),
        allowNull: false,
        defaultValue: '',
        set(value) {
          this.setDataValue(
            'sku',
            String(value ?? '')
              .trim()
              .toUpperCase(),
          );
        },
      },
      barcode: { type: DataTypes.STRING(60), allowNull: false, defaultValue: '' },
      warehouse: { type: DataTypes.STRING(24), field: 'warehouse_id' },
      category: { type: DataTypes.STRING(24), field: 'category_id' },
      brand: { type: DataTypes.STRING(24), field: 'brand_id' },
      unit: { type: DataTypes.STRING(24), field: 'unit_id' },
      purchasePrice: money(),
      salePrice: money(),
      taxPercent: {
        type: DataTypes.DECIMAL(9, 4),
        allowNull: false,
        defaultValue: 0,
        validate: { min: 0 },
      },
      minStock: quantity({ validate: { min: 0 } }),
      isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
      // A base64 data URL (small, client-resized thumbnail) — stored on the
      // row itself rather than as a separate file, so it lives and dies with
      // the product (no orphaned files to clean up if a warehouse/store is
      // later removed).
      image: { type: DataTypes.TEXT, allowNull: true },
    },
    { tableName: 'products' },
  );
};
