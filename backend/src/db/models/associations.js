function associateModels(models) {
  const {
    Role,
    User,
    Store,
    StoreWarehouse,
    Warehouse,
    Category,
    Brand,
    Unit,
    Product,
    Customer,
    Vendor,
    Supplier,
    Transporter,
    BankAccount,
    StockLevel,
    StockMovement,
    Sale,
    SaleItem,
    SaleLabour,
    SaleDraft,
    SaleReturn,
    SaleReturnItem,
    SaleWarehouseGatePass,
    SaleReturnGatePass,
    StockReceipt,
    StockReceiptItem,
    StockReceiptLabour,
    Estimate,
    EstimateItem,
    EstimateFollowUp,
    ExpenseCategory,
    Expense,
    PendingEntity,
    DayEnd,
    GoodsPurchase,
    GoodsPurchaseItem,
    Invoice,
    InvoiceItem,
    JournalEntry,
    JournalLine,
    GatePass,
    GatePassItem,
  } = models;

  Role.hasMany(User, { foreignKey: 'role', sourceKey: 'name', as: 'users' });
  User.belongsTo(Role, { foreignKey: 'role', targetKey: 'name', as: 'roleInfo' });
  User.belongsTo(Store, { foreignKey: 'store', as: 'storeInfo' });

  Store.belongsToMany(Warehouse, {
    through: StoreWarehouse,
    foreignKey: 'storeId',
    otherKey: 'warehouseId',
    as: 'warehouses',
  });
  Warehouse.belongsToMany(Store, {
    through: StoreWarehouse,
    foreignKey: 'warehouseId',
    otherKey: 'storeId',
    as: 'stores',
  });

  Warehouse.hasMany(Product, { foreignKey: 'warehouse', as: 'products' });
  Product.belongsTo(Warehouse, { foreignKey: 'warehouse', as: 'warehouseInfo' });
  Product.belongsTo(Category, { foreignKey: 'category', as: 'categoryInfo' });
  Product.belongsTo(Brand, { foreignKey: 'brand', as: 'brandInfo' });
  Product.belongsTo(Unit, { foreignKey: 'unit', as: 'unitInfo' });
  Product.hasMany(StockLevel, { foreignKey: 'product', as: 'stockLevels' });
  StockLevel.belongsTo(Product, { foreignKey: 'product', as: 'productInfo' });
  StockLevel.belongsTo(Warehouse, { foreignKey: 'warehouse', as: 'warehouseInfo' });
  StockMovement.belongsTo(Product, { foreignKey: 'product', as: 'productInfo' });
  StockMovement.belongsTo(Warehouse, { foreignKey: 'warehouse', as: 'warehouseInfo' });

  Sale.hasMany(SaleItem, { foreignKey: 'saleId', as: 'items' });
  SaleItem.belongsTo(Sale, { foreignKey: 'saleId' });
  Sale.hasMany(SaleLabour, { foreignKey: 'saleId', as: 'labour' });
  SaleLabour.belongsTo(Sale, { foreignKey: 'saleId' });
  Sale.belongsTo(Customer, { foreignKey: 'customer', as: 'customerInfo' });
  Sale.belongsTo(Warehouse, { foreignKey: 'warehouse', as: 'warehouseInfo' });
  Sale.belongsTo(BankAccount, { foreignKey: 'bankAccount', as: 'bankAccountInfo' });
  Sale.belongsTo(Store, { foreignKey: 'store', as: 'storeInfo' });
  Sale.belongsTo(Transporter, { foreignKey: 'transporter', as: 'transporterInfo' });
  SaleItem.belongsTo(Vendor, { foreignKey: 'vendor', as: 'vendorInfo' });

  SaleDraft.belongsTo(User, { foreignKey: 'createdBy', as: 'creator' });
  SaleDraft.belongsTo(Store, { foreignKey: 'store', as: 'storeInfo' });

  SaleReturn.belongsTo(Sale, { foreignKey: 'sale', as: 'saleInfo' });
  SaleReturn.belongsTo(Customer, { foreignKey: 'customer', as: 'customerInfo' });
  SaleReturn.hasMany(SaleReturnItem, { foreignKey: 'saleReturnId', as: 'items' });
  SaleReturnItem.belongsTo(SaleReturn, { foreignKey: 'saleReturnId' });
  SaleReturnItem.belongsTo(Product, { foreignKey: 'product', as: 'productInfo' });
  SaleReturnItem.belongsTo(Warehouse, { foreignKey: 'warehouse', as: 'warehouseInfo' });

  StockReceipt.belongsTo(Supplier, { foreignKey: 'supplier', as: 'supplierInfo' });
  StockReceipt.belongsTo(Store, { foreignKey: 'store', as: 'storeInfo' });
  StockReceipt.belongsTo(Warehouse, { foreignKey: 'warehouse', as: 'warehouseInfo' });
  StockReceipt.belongsTo(Transporter, { foreignKey: 'transporter', as: 'transporterInfo' });
  StockReceipt.hasMany(StockReceiptItem, { foreignKey: 'stockReceiptId', as: 'items' });
  StockReceiptItem.belongsTo(StockReceipt, { foreignKey: 'stockReceiptId' });
  StockReceipt.hasMany(StockReceiptLabour, { foreignKey: 'stockReceiptId', as: 'labour' });
  StockReceiptLabour.belongsTo(StockReceipt, { foreignKey: 'stockReceiptId' });

  Estimate.belongsTo(Customer, { foreignKey: 'customer', as: 'customerInfo' });
  Estimate.belongsTo(Store, { foreignKey: 'store', as: 'storeInfo' });
  Estimate.hasMany(EstimateItem, { foreignKey: 'estimateId', as: 'items' });
  EstimateItem.belongsTo(Estimate, { foreignKey: 'estimateId' });
  Estimate.hasMany(EstimateFollowUp, { foreignKey: 'estimateId', as: 'followUps' });
  EstimateFollowUp.belongsTo(Estimate, { foreignKey: 'estimateId' });

  Expense.belongsTo(ExpenseCategory, { foreignKey: 'category', as: 'categoryInfo' });
  Expense.belongsTo(BankAccount, { foreignKey: 'bankAccount', as: 'bankAccountInfo' });
  Expense.belongsTo(Store, { foreignKey: 'store', as: 'storeInfo' });
  Expense.belongsTo(Warehouse, { foreignKey: 'warehouse', as: 'warehouseInfo' });

  PendingEntity.belongsTo(Sale, { foreignKey: 'sale', as: 'saleInfo' });
  PendingEntity.belongsTo(StockReceipt, { foreignKey: 'stockReceipt', as: 'stockReceiptInfo' });
  PendingEntity.belongsTo(Product, { foreignKey: 'product', as: 'productInfo' });
  PendingEntity.belongsTo(Vendor, { foreignKey: 'vendor', as: 'vendorInfo' });
  PendingEntity.belongsTo(Supplier, { foreignKey: 'supplier', as: 'supplierInfo' });
  PendingEntity.belongsTo(Store, { foreignKey: 'store', as: 'storeInfo' });
  PendingEntity.belongsTo(Warehouse, { foreignKey: 'warehouse', as: 'warehouseInfo' });
  DayEnd.belongsTo(Store, { foreignKey: 'store', as: 'storeInfo' });
  DayEnd.belongsTo(User, { foreignKey: 'closedBy', as: 'closedByInfo' });
  DayEnd.belongsTo(User, { foreignKey: 'reopenedBy', as: 'reopenedByInfo' });

  GoodsPurchase.hasMany(GoodsPurchaseItem, { foreignKey: 'purchaseId', as: 'items' });
  GoodsPurchaseItem.belongsTo(GoodsPurchase, { foreignKey: 'purchaseId' });
  GoodsPurchase.belongsTo(Vendor, { foreignKey: 'vendor', as: 'vendorInfo' });
  GoodsPurchase.belongsTo(Warehouse, { foreignKey: 'warehouse', as: 'warehouseInfo' });

  Invoice.hasMany(InvoiceItem, { foreignKey: 'invoiceId', as: 'items' });
  InvoiceItem.belongsTo(Invoice, { foreignKey: 'invoiceId' });
  Invoice.belongsTo(GoodsPurchase, { foreignKey: 'purchase', as: 'purchaseInfo' });
  Invoice.belongsTo(Vendor, { foreignKey: 'vendor', as: 'vendorInfo' });
  Invoice.belongsTo(Warehouse, { foreignKey: 'warehouse', as: 'warehouseInfo' });

  JournalEntry.hasMany(JournalLine, { foreignKey: 'journalEntryId', as: 'lines' });
  JournalLine.belongsTo(JournalEntry, { foreignKey: 'journalEntryId' });
  JournalEntry.belongsTo(Warehouse, { foreignKey: 'warehouse', as: 'warehouseInfo' });
  JournalEntry.belongsTo(Store, { foreignKey: 'store', as: 'storeInfo' });

  GatePass.hasMany(GatePassItem, { foreignKey: 'gatePassId', as: 'items' });
  GatePassItem.belongsTo(GatePass, { foreignKey: 'gatePassId' });
  GatePass.belongsTo(User, { foreignKey: 'createdBy', as: 'creator' });
  GatePass.belongsTo(User, { foreignKey: 'processedBy', as: 'processor' });
  GatePass.belongsTo(User, { foreignKey: 'lastEditedBy', as: 'lastEditor' });
  GatePass.belongsTo(Store, { foreignKey: 'store', as: 'storeInfo' });
  GatePass.belongsTo(Sale, { foreignKey: 'sale', as: 'saleInfo' });
  GatePass.belongsTo(SaleReturn, { foreignKey: 'saleReturn', as: 'saleReturnInfo' });
  GatePass.belongsTo(StockReceipt, { foreignKey: 'stockReceipt', as: 'stockReceiptInfo' });

  Sale.belongsToMany(GatePass, {
    through: SaleWarehouseGatePass,
    foreignKey: 'saleId',
    otherKey: 'gatePassId',
    as: 'warehouseGatePasses',
  });
  SaleReturn.belongsToMany(GatePass, {
    through: SaleReturnGatePass,
    foreignKey: 'saleReturnId',
    otherKey: 'gatePassId',
    as: 'warehouseGatePasses',
  });
}

module.exports = { associateModels };
