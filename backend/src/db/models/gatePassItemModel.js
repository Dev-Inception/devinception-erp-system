const { DataTypes, quantity, defineModel } = require('./helpers');

module.exports = (db) =>
  defineModel(
    db,
    'GatePassItem',
    {
      id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
      gatePassId: { type: DataTypes.STRING(24), allowNull: false, field: 'gate_pass_id' },
      position: { type: DataTypes.INTEGER, allowNull: false },
      product: { type: DataTypes.STRING(24), allowNull: false, field: 'product_id' },
      name: { type: DataTypes.STRING(160), allowNull: false },
      sku: { type: DataTypes.STRING(60), allowNull: false, defaultValue: '' },
      barcode: { type: DataTypes.STRING(60), allowNull: false, defaultValue: '' },
      quantity: quantity({ defaultValue: undefined }),
      unitPrice: DataTypes.BIGINT,
      lineTotal: DataTypes.BIGINT,
      loadedQuantity: quantity({ allowNull: true, defaultValue: null }),
      loadConfirmed: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    },
    { tableName: 'gate_pass_items', timestamps: false },
  );
