const { DataTypes } = require('sequelize');
const { quantity, defineModel } = require('./helpers');

module.exports = function defineGatePassItem(db) {
  return defineModel(
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
      quantity: quantity({ validate: { min: 0 } }),
      loadedQuantity: { type: DataTypes.DECIMAL(20, 6), field: 'loaded_quantity' },
      loadConfirmed: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
        field: 'load_confirmed',
      },
    },
    { tableName: 'gate_pass_items', timestamps: false },
  );
};
