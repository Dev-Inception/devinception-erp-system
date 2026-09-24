const { DataTypes } = require('sequelize');
const { id, quantity, defineModel } = require('./helpers');

module.exports = function definePendingEntity(db) {
  return defineModel(
    db,
    'PendingEntity',
    {
      id: id(),
      sourceType: {
        type: DataTypes.STRING(20),
        allowNull: false,
        field: 'source_type',
        validate: { isIn: [['SALE_ITEM', 'STOCK_RECEIPT_ITEM', 'SALE_LABOUR']] },
      },
      sale: { type: DataTypes.STRING(24), field: 'sale_id' },
      stockReceipt: { type: DataTypes.STRING(24), field: 'stock_receipt_id' },
      sourceNo: { type: DataTypes.STRING(40), allowNull: false, defaultValue: '' },
      vendor: { type: DataTypes.STRING(24), field: 'vendor_id' },
      vendorName: { type: DataTypes.STRING(120), allowNull: false, defaultValue: '' },
      supplier: { type: DataTypes.STRING(24), field: 'supplier_id' },
      supplierName: { type: DataTypes.STRING(120), allowNull: false, defaultValue: '' },
      // Null for SALE_LABOUR rows (a labour line has no product).
      product: { type: DataTypes.STRING(24), field: 'product_id' },
      productName: { type: DataTypes.STRING(160), allowNull: false, defaultValue: '' },
      // SALE_LABOUR only: which labourer/service the line is for, and what
      // the customer was charged for it (paisa). `purchasePrice`/`lineTotal`
      // hold the payout the labourer is actually owed once priced.
      labour: { type: DataTypes.STRING(24), field: 'labour_id' },
      labourName: { type: DataTypes.STRING(100), allowNull: false, defaultValue: '' },
      serviceName: { type: DataTypes.STRING(80), allowNull: false, defaultValue: '' },
      chargedAmount: { type: DataTypes.BIGINT, validate: { min: 0 } },
      quantity: quantity({ validate: { min: 0 } }),
      store: { type: DataTypes.STRING(24), field: 'store_id' },
      warehouse: { type: DataTypes.STRING(24), field: 'warehouse_id' },
      date: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
      status: {
        type: DataTypes.STRING(10),
        allowNull: false,
        defaultValue: 'PENDING',
        validate: { isIn: [['PENDING', 'PRICED']] },
      },
      purchasePrice: { type: DataTypes.BIGINT, validate: { min: 0 } },
      lineTotal: { type: DataTypes.BIGINT, validate: { min: 0 } },
      pricedBy: { type: DataTypes.STRING(24), field: 'priced_by_id' },
      pricedAt: { type: DataTypes.DATE },
      createdBy: { type: DataTypes.STRING(24), field: 'created_by_id' },
    },
    { tableName: 'pending_entities' },
  );
};
