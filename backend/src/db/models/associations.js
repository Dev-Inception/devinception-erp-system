function associateModels(models) {
  const {
    Role,
    User,
    Warehouse,
    Category,
    Brand,
    Unit,
    Product,
    Customer,
    Vendor,
    BankAccount,
    StockLevel,
    StockMovement,
    Sale,
    SaleItem,
    SaleLabour,
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

  GatePass.hasMany(GatePassItem, { foreignKey: 'gatePassId', as: 'items' });
  GatePassItem.belongsTo(GatePass, { foreignKey: 'gatePassId' });
  GatePass.belongsTo(User, { foreignKey: 'createdBy', as: 'creator' });
  GatePass.belongsTo(User, { foreignKey: 'processedBy', as: 'processor' });
  GatePass.belongsTo(User, { foreignKey: 'lastEditedBy', as: 'lastEditor' });
}

module.exports = { associateModels };
