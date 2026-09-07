function associateModels(models) {
  const {
    Role,
    User,
    Store,
    Warehouse,
    StoreWarehouse,
    Category,
    Brand,
    Unit,
    ExpenseCategory,
    Product,
    Customer,
    Vendor,
    Supplier,
    Transporter,
    BankAccount,
    Labour,
    StockLevel,
    StockMovement,
    Sale,
    SaleItem,
    SaleLabour,
    SaleWarehouseGatePass,
    SaleDraft,
    SaleReturn,
    SaleReturnItem,
    ReturnWarehouseGatePass,
    StockReceipt,
    StockReceiptItem,
    StockReceiptLabour,
    Estimate,
    EstimateItem,
    EstimateFollowUp,
    PendingEntity,
    GatePass,
    GatePassItem,
    Expense,
    DayEnd,
    JournalEntry,
    JournalLine,
  } = models;

  // Identity / RBAC
  Role.hasMany(User, { foreignKey: 'role', sourceKey: 'name', as: 'users' });
  User.belongsTo(Role, { foreignKey: 'role', targetKey: 'name', as: 'roleInfo' });
  User.belongsTo(Store, { foreignKey: 'store', as: 'storeInfo' });

  // Locations / catalog
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

  Customer.belongsTo(Store, { foreignKey: 'store', as: 'storeInfo' });
  BankAccount.belongsTo(Store, { foreignKey: 'store', as: 'storeInfo' });

  // Sales
  Sale.hasMany(SaleItem, { foreignKey: 'saleId', as: 'items' });
  SaleItem.belongsTo(Sale, { foreignKey: 'saleId' });
  SaleItem.belongsTo(Product, { foreignKey: 'product', as: 'productInfo' });
  SaleItem.belongsTo(Warehouse, { foreignKey: 'warehouse', as: 'warehouseInfo' });
  SaleItem.belongsTo(Vendor, { foreignKey: 'vendor', as: 'vendorInfo' });

  Sale.hasMany(SaleLabour, { foreignKey: 'saleId', as: 'labour' });
  SaleLabour.belongsTo(Sale, { foreignKey: 'saleId' });
  SaleLabour.belongsTo(Labour, { foreignKey: 'labour', as: 'labourInfo' });

  Sale.hasMany(SaleWarehouseGatePass, { foreignKey: 'sale', as: 'warehouseGatePasses' });
  SaleWarehouseGatePass.belongsTo(Sale, { foreignKey: 'sale' });
  SaleWarehouseGatePass.belongsTo(Warehouse, { foreignKey: 'warehouse', as: 'warehouseInfo' });
  SaleWarehouseGatePass.belongsTo(GatePass, { foreignKey: 'gatePass', as: 'gatePassInfo' });

  Sale.belongsTo(Customer, { foreignKey: 'customer', as: 'customerInfo' });
  Sale.belongsTo(Store, { foreignKey: 'store', as: 'storeInfo' });
  Sale.belongsTo(Warehouse, { foreignKey: 'warehouse', as: 'warehouseInfo' });
  Sale.belongsTo(BankAccount, { foreignKey: 'bankAccount', as: 'bankAccountInfo' });
  Sale.belongsTo(Transporter, { foreignKey: 'transporter', as: 'transporterInfo' });
  Sale.belongsTo(BankAccount, {
    foreignKey: 'transportFareBankAccount',
    as: 'transportFareBankAccountInfo',
  });
  Sale.belongsTo(GatePass, { foreignKey: 'gatePass', as: 'gatePassInfo' });
  Sale.belongsTo(GatePass, { foreignKey: 'vendorGatePass', as: 'vendorGatePassInfo' });
  Sale.belongsTo(User, { foreignKey: 'createdBy', as: 'creator' });
  Sale.belongsTo(User, { foreignKey: 'lastEditedBy', as: 'lastEditor' });

  SaleDraft.belongsTo(User, { foreignKey: 'createdBy', as: 'creator' });
  SaleDraft.belongsTo(Store, { foreignKey: 'store', as: 'storeInfo' });

  Sale.hasMany(SaleReturn, { foreignKey: 'sale', as: 'returns' });
  SaleReturn.belongsTo(Sale, { foreignKey: 'sale' });
  SaleReturn.hasMany(SaleReturnItem, { foreignKey: 'saleReturnId', as: 'items' });
  SaleReturnItem.belongsTo(SaleReturn, { foreignKey: 'saleReturnId' });
  SaleReturnItem.belongsTo(Product, { foreignKey: 'product', as: 'productInfo' });
  SaleReturnItem.belongsTo(Warehouse, { foreignKey: 'warehouse', as: 'warehouseInfo' });
  SaleReturn.hasMany(ReturnWarehouseGatePass, {
    foreignKey: 'saleReturn',
    as: 'warehouseGatePasses',
  });
  ReturnWarehouseGatePass.belongsTo(SaleReturn, { foreignKey: 'saleReturn' });
  ReturnWarehouseGatePass.belongsTo(Warehouse, { foreignKey: 'warehouse', as: 'warehouseInfo' });
  ReturnWarehouseGatePass.belongsTo(GatePass, { foreignKey: 'gatePass', as: 'gatePassInfo' });
  SaleReturn.belongsTo(Customer, { foreignKey: 'customer', as: 'customerInfo' });
  SaleReturn.belongsTo(User, { foreignKey: 'createdBy', as: 'creator' });

  // Purchasing
  StockReceipt.hasMany(StockReceiptItem, { foreignKey: 'stockReceiptId', as: 'items' });
  StockReceiptItem.belongsTo(StockReceipt, { foreignKey: 'stockReceiptId' });
  StockReceiptItem.belongsTo(Product, { foreignKey: 'product', as: 'productInfo' });
  StockReceipt.hasMany(StockReceiptLabour, { foreignKey: 'stockReceiptId', as: 'labour' });
  StockReceiptLabour.belongsTo(StockReceipt, { foreignKey: 'stockReceiptId' });
  StockReceiptLabour.belongsTo(Labour, { foreignKey: 'labour', as: 'labourInfo' });
  StockReceipt.belongsTo(Supplier, { foreignKey: 'supplier', as: 'supplierInfo' });
  StockReceipt.belongsTo(Store, { foreignKey: 'store', as: 'storeInfo' });
  StockReceipt.belongsTo(Warehouse, { foreignKey: 'warehouse', as: 'warehouseInfo' });
  StockReceipt.belongsTo(Transporter, { foreignKey: 'transporter', as: 'transporterInfo' });
  StockReceipt.belongsTo(BankAccount, {
    foreignKey: 'truckFareBankAccount',
    as: 'truckFareBankAccountInfo',
  });
  StockReceipt.belongsTo(User, { foreignKey: 'createdBy', as: 'creator' });
  StockReceipt.belongsTo(GatePass, { foreignKey: 'gatePass', as: 'gatePassInfo' });

  // Estimates
  Estimate.hasMany(EstimateItem, { foreignKey: 'estimateId', as: 'items' });
  EstimateItem.belongsTo(Estimate, { foreignKey: 'estimateId' });
  EstimateItem.belongsTo(Product, { foreignKey: 'product', as: 'productInfo' });
  Estimate.hasMany(EstimateFollowUp, { foreignKey: 'estimateId', as: 'followUps' });
  EstimateFollowUp.belongsTo(Estimate, { foreignKey: 'estimateId' });
  EstimateFollowUp.belongsTo(User, { foreignKey: 'by', as: 'byInfo' });
  Estimate.belongsTo(Customer, { foreignKey: 'customer', as: 'customerInfo' });
  Estimate.belongsTo(Store, { foreignKey: 'store', as: 'storeInfo' });
  Estimate.belongsTo(Sale, { foreignKey: 'convertedSale', as: 'convertedSaleInfo' });
  Estimate.belongsTo(User, { foreignKey: 'createdBy', as: 'creator' });

  // Pending entities
  PendingEntity.belongsTo(Sale, { foreignKey: 'sale', as: 'saleInfo' });
  PendingEntity.belongsTo(StockReceipt, { foreignKey: 'stockReceipt', as: 'stockReceiptInfo' });
  PendingEntity.belongsTo(Vendor, { foreignKey: 'vendor', as: 'vendorInfo' });
  PendingEntity.belongsTo(Supplier, { foreignKey: 'supplier', as: 'supplierInfo' });
  PendingEntity.belongsTo(Product, { foreignKey: 'product', as: 'productInfo' });
  PendingEntity.belongsTo(Store, { foreignKey: 'store', as: 'storeInfo' });
  PendingEntity.belongsTo(Warehouse, { foreignKey: 'warehouse', as: 'warehouseInfo' });
  PendingEntity.belongsTo(User, { foreignKey: 'pricedBy', as: 'pricer' });
  PendingEntity.belongsTo(User, { foreignKey: 'createdBy', as: 'creator' });

  // Gate passes
  GatePass.hasMany(GatePassItem, { foreignKey: 'gatePassId', as: 'items' });
  GatePassItem.belongsTo(GatePass, { foreignKey: 'gatePassId' });
  GatePassItem.belongsTo(Product, { foreignKey: 'product', as: 'productInfo' });
  GatePass.belongsTo(Sale, { foreignKey: 'sale', as: 'saleInfo' });
  GatePass.belongsTo(SaleReturn, { foreignKey: 'saleReturn', as: 'saleReturnInfo' });
  GatePass.belongsTo(StockReceipt, { foreignKey: 'stockReceipt', as: 'stockReceiptInfo' });
  GatePass.belongsTo(Store, { foreignKey: 'store', as: 'storeInfo' });
  GatePass.belongsTo(Warehouse, { foreignKey: 'warehouse', as: 'warehouseInfo' });
  GatePass.belongsTo(User, { foreignKey: 'processedBy', as: 'processor' });
  GatePass.belongsTo(User, { foreignKey: 'lastEditedBy', as: 'lastEditor' });
  GatePass.belongsTo(User, { foreignKey: 'createdBy', as: 'creator' });

  // Expenses
  Expense.belongsTo(ExpenseCategory, { foreignKey: 'category', as: 'categoryInfo' });
  Expense.belongsTo(BankAccount, { foreignKey: 'bankAccount', as: 'bankAccountInfo' });
  Expense.belongsTo(Store, { foreignKey: 'store', as: 'storeInfo' });
  Expense.belongsTo(Warehouse, { foreignKey: 'warehouse', as: 'warehouseInfo' });
  Expense.belongsTo(JournalEntry, { foreignKey: 'journalEntry', as: 'journalEntryInfo' });
  Expense.belongsTo(User, { foreignKey: 'approvedBy', as: 'approver' });
  Expense.belongsTo(User, { foreignKey: 'rejectedBy', as: 'rejecter' });
  Expense.belongsTo(User, { foreignKey: 'createdBy', as: 'creator' });

  // Day end
  DayEnd.belongsTo(Store, { foreignKey: 'store', as: 'storeInfo' });
  DayEnd.belongsTo(User, { foreignKey: 'closedBy', as: 'closer' });
  DayEnd.belongsTo(User, { foreignKey: 'reopenedBy', as: 'reopener' });

  // Accounting
  JournalEntry.hasMany(JournalLine, { foreignKey: 'journalEntryId', as: 'lines' });
  JournalLine.belongsTo(JournalEntry, { foreignKey: 'journalEntryId' });
  JournalEntry.belongsTo(Warehouse, { foreignKey: 'warehouse', as: 'warehouseInfo' });
  JournalEntry.belongsTo(Store, { foreignKey: 'store', as: 'storeInfo' });
  JournalEntry.belongsTo(User, { foreignKey: 'createdBy', as: 'creator' });
}

module.exports = { associateModels };
