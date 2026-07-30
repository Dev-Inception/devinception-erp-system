const { DataTypes, id, money, quantity, defineModel } = require('./helpers');

module.exports = (db) =>
  defineModel(
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
          this.setDataValue('sku', (value || '').trim().toUpperCase());
        },
      },
      barcode: { type: DataTypes.STRING(60), allowNull: false, defaultValue: '' },
      warehouse: { type: DataTypes.STRING(24), field: 'warehouse_id' },
      category: { type: DataTypes.STRING(24), field: 'category_id' },
      brand: { type: DataTypes.STRING(24), field: 'brand_id' },
      unit: { type: DataTypes.STRING(24), field: 'unit_id' },
      purchasePrice: money(),
      salePrice: money(),
      taxPercent: { type: DataTypes.DECIMAL(9, 4), allowNull: false, defaultValue: 0 },
      minStock: quantity(),
      isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    },
    { tableName: 'products' },
  );
