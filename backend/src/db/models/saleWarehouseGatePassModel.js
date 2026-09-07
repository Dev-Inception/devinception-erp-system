const { DataTypes, defineModel } = require('./helpers');
module.exports = (db) =>
  defineModel(
    db,
    'SaleWarehouseGatePass',
    {
      saleId: { type: DataTypes.STRING(24), primaryKey: true, field: 'sale_id' },
      warehouseId: { type: DataTypes.STRING(24), primaryKey: true, field: 'warehouse_id' },
      gatePassId: {
        type: DataTypes.STRING(24),
        allowNull: false,
        unique: true,
        field: 'gate_pass_id',
      },
    },
    { tableName: 'sale_warehouse_gate_passes', timestamps: false },
  );
