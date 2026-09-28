const { DataTypes } = require('sequelize');
const { money, defineModel } = require('./helpers');

module.exports = function defineSaleLabour(db) {
  return defineModel(
    db,
    'SaleLabour',
    {
      id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
      saleId: { type: DataTypes.STRING(24), allowNull: false, field: 'sale_id' },
      position: { type: DataTypes.INTEGER, allowNull: false },
      labour: { type: DataTypes.STRING(24), allowNull: false, field: 'labour_id' },
      name: { type: DataTypes.STRING(100), allowNull: false },
      phoneNumber: { type: DataTypes.STRING(20), allowNull: false, defaultValue: '' },
      // Which billable service (from labour_services) this line's rent pays
      // for — a labourer can have several lines on the same sale, one per
      // service. Nullable: stock-receipt labour lines (shared resolver, see
      // labourService.resolveLabourLines) don't carry a service.
      service: { type: DataTypes.STRING(24), field: 'service_id' },
      serviceName: { type: DataTypes.STRING(80), allowNull: false, defaultValue: '' },
      rent: money(),
    },
    { tableName: 'sale_labour', timestamps: false },
  );
};
