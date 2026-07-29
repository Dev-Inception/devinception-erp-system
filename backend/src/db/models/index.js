const { DataTypes } = require('sequelize');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { getPostgres } = require('../postgres');
const { createId } = require('../id');
const { ACCOUNT_KINDS, PAYMENT_METHODS, REF } = require('../../utils/finance');

let models;

const id = () => ({
  type: DataTypes.STRING(24),
  primaryKey: true,
  defaultValue: createId,
});

const money = (options = {}) => ({
  type: DataTypes.BIGINT,
  allowNull: false,
  defaultValue: 0,
  validate: options.signed ? {} : { min: 0 },
  ...options,
});

const quantity = (options = {}) => ({
  type: DataTypes.INTEGER,
  allowNull: false,
  defaultValue: 0,
  ...options,
});

function publicJson(instance, hidden = []) {
  const values = { ...instance.get() };
  values._id = values.id;
  delete values.id;
  for (const field of hidden) delete values[field];
  return values;
}

function initializeModels() {
  if (models) return models;

  const db = getPostgres();
  const common = {
    sequelize: db,
    timestamps: true,
    underscored: true,
  };
  const define = (name, attributes, options = {}) =>
    db.define(name, attributes, { ...common, ...options });

  const Role = define(
    'Role',
    {
      id: id(),
      name: { type: DataTypes.STRING(80), allowNull: false },
      description: { type: DataTypes.STRING(200), allowNull: false, defaultValue: '' },
      permissions: { type: DataTypes.ARRAY(DataTypes.TEXT), allowNull: false, defaultValue: [] },
      isSystem: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    },
    { tableName: 'roles' },
  );

  const User = define(
    'User',
    {
      id: id(),
      name: { type: DataTypes.STRING(80), allowNull: false },
      email: {
        type: DataTypes.STRING,
        allowNull: false,
        set(value) {
          this.setDataValue('email', value.trim().toLowerCase());
        },
      },
      password: { type: DataTypes.STRING, allowNull: false },
      role: { type: DataTypes.STRING(80), allowNull: false, defaultValue: 'cashier' },
      isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
      passwordResetToken: DataTypes.STRING,
      passwordResetExpires: DataTypes.DATE,
      passwordChangedAt: DataTypes.DATE,
    },
    {
      tableName: 'users',
      defaultScope: {
        attributes: {
          exclude: ['password', 'passwordResetToken', 'passwordResetExpires', 'passwordChangedAt'],
        },
      },
      scopes: {
        withPassword: {
          attributes: {
            include: [
              'password',
              'passwordResetToken',
              'passwordResetExpires',
              'passwordChangedAt',
            ],
          },
        },
      },
      hooks: {
        async beforeSave(user) {
          if (!user.changed('password')) return;
          user.password = await bcrypt.hash(user.password, 10);
          if (!user.isNewRecord) user.passwordChangedAt = new Date(Date.now() - 1000);
        },
      },
    },
  );
  User.prototype.comparePassword = function comparePassword(candidate) {
    return bcrypt.compare(candidate, this.password);
  };
  User.prototype.passwordChangedAfter = function passwordChangedAfter(jwtIat) {
    if (!this.passwordChangedAt) return false;
    return jwtIat < Math.floor(this.passwordChangedAt.getTime() / 1000);
  };
  User.prototype.createPasswordResetToken = function createPasswordResetToken(expiresMin) {
    const rawToken = crypto.randomBytes(32).toString('hex');
    this.passwordResetToken = crypto.createHash('sha256').update(rawToken).digest('hex');
    this.passwordResetExpires = new Date(Date.now() + expiresMin * 60 * 1000);
    return rawToken;
  };

  const Warehouse = define(
    'Warehouse',
    {
      id: id(),
      name: { type: DataTypes.STRING(120), allowNull: false },
      location: { type: DataTypes.STRING(120), allowNull: false, defaultValue: '' },
      address: { type: DataTypes.STRING(300), allowNull: false, defaultValue: '' },
      isDefault: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    },
    { tableName: 'warehouses' },
  );

  const Category = define(
    'Category',
    {
      id: id(),
      name: { type: DataTypes.STRING(80), allowNull: false },
      description: { type: DataTypes.STRING(500), allowNull: false, defaultValue: '' },
      isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    },
    { tableName: 'categories' },
  );
  const Brand = define(
    'Brand',
    {
      id: id(),
      name: { type: DataTypes.STRING(80), allowNull: false },
      isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    },
    { tableName: 'brands' },
  );
  const Unit = define(
    'Unit',
    {
      id: id(),
      name: { type: DataTypes.STRING(40), allowNull: false },
      abbreviation: { type: DataTypes.STRING(20), allowNull: false, defaultValue: '' },
      isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    },
    { tableName: 'units' },
  );

  const Product = define(
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

  const Customer = define(
    'Customer',
    {
      id: id(),
      name: { type: DataTypes.STRING(120), allowNull: false },
      phone: { type: DataTypes.STRING(30), allowNull: false, defaultValue: '' },
      email: { type: DataTypes.STRING(120), allowNull: false, defaultValue: '' },
      address: { type: DataTypes.STRING(300), allowNull: false, defaultValue: '' },
      creditLimit: money(),
      outstanding: money(),
    },
    { tableName: 'customers' },
  );
  const Vendor = define(
    'Vendor',
    {
      id: id(),
      name: { type: DataTypes.STRING(120), allowNull: false },
      phone: { type: DataTypes.STRING(30), allowNull: false, defaultValue: '' },
      email: { type: DataTypes.STRING(120), allowNull: false, defaultValue: '' },
      ntn: { type: DataTypes.STRING(40), allowNull: false, defaultValue: '' },
      address: { type: DataTypes.STRING(300), allowNull: false, defaultValue: '' },
      outstanding: money(),
    },
    { tableName: 'vendors' },
  );
  const BankAccount = define(
    'BankAccount',
    {
      id: id(),
      name: { type: DataTypes.STRING(120), allowNull: false },
      bankName: { type: DataTypes.STRING(120), allowNull: false, defaultValue: '' },
      accountNumber: { type: DataTypes.STRING(60), allowNull: false, defaultValue: '' },
      isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    },
    { tableName: 'bank_accounts' },
  );
  const Labour = define(
    'Labour',
    {
      id: id(),
      name: { type: DataTypes.STRING(100), allowNull: false },
      phoneNumber: { type: DataTypes.STRING(15), allowNull: false, unique: true },
    },
    { tableName: 'labour' },
  );

  const StockLevel = define(
    'StockLevel',
    {
      id: id(),
      product: { type: DataTypes.STRING(24), allowNull: false, field: 'product_id' },
      warehouse: { type: DataTypes.STRING(24), allowNull: false, field: 'warehouse_id' },
      quantity: quantity(),
      avgCost: { type: DataTypes.DECIMAL(30, 12), allowNull: false, defaultValue: 0 },
    },
    { tableName: 'stock_levels' },
  );
  const StockMovement = define(
    'StockMovement',
    {
      id: id(),
      product: { type: DataTypes.STRING(24), allowNull: false, field: 'product_id' },
      warehouse: { type: DataTypes.STRING(24), allowNull: false, field: 'warehouse_id' },
      type: { type: DataTypes.ENUM('IN', 'OUT', 'ADJUST'), allowNull: false },
      quantity: quantity({ defaultValue: undefined }),
      unitCost: { type: DataTypes.DECIMAL(30, 12), allowNull: false, defaultValue: 0 },
      totalCost: { type: DataTypes.BIGINT },
      refType: { type: DataTypes.STRING(30), allowNull: false, defaultValue: '' },
      refNo: { type: DataTypes.STRING(100), allowNull: false, defaultValue: '' },
      date: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    },
    { tableName: 'stock_movements' },
  );

  const Sale = define(
    'Sale',
    {
      id: id(),
      number: { type: DataTypes.STRING(100), allowNull: false, unique: true },
      customer: { type: DataTypes.STRING(24), field: 'customer_id' },
      customerName: { type: DataTypes.STRING(120), allowNull: false, defaultValue: 'Walk-in' },
      warehouse: { type: DataTypes.STRING(24), allowNull: false, field: 'warehouse_id' },
      date: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
      subtotal: money({ defaultValue: undefined }),
      discount: money(),
      taxPercent: { type: DataTypes.DECIMAL(9, 4), allowNull: false, defaultValue: 0 },
      tax: money(),
      total: money({ defaultValue: undefined }),
      cost: money(),
      paymentMethod: {
        type: DataTypes.STRING(30),
        allowNull: false,
        validate: { isIn: [PAYMENT_METHODS] },
      },
      cashAmount: money(),
      onlineAmount: money(),
      creditAmount: money(),
      bankAccount: { type: DataTypes.STRING(24), field: 'bank_account_id' },
      transferReceiptRef: { type: DataTypes.TEXT, allowNull: false, defaultValue: '' },
      gatePass: { type: DataTypes.STRING(24), field: 'gate_pass_id' },
      createdBy: { type: DataTypes.STRING(24), field: 'created_by_id' },
    },
    { tableName: 'sales' },
  );
  const SaleItem = define(
    'SaleItem',
    {
      id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
      saleId: { type: DataTypes.STRING(24), allowNull: false, field: 'sale_id' },
      position: { type: DataTypes.INTEGER, allowNull: false },
      product: { type: DataTypes.STRING(24), allowNull: false, field: 'product_id' },
      name: { type: DataTypes.STRING(160), allowNull: false },
      quantity: quantity({ defaultValue: undefined }),
      unitPrice: money({ defaultValue: undefined }),
      lineTotal: money({ defaultValue: undefined }),
      cost: money(),
    },
    { tableName: 'sale_items', timestamps: false },
  );
  const SaleLabour = define(
    'SaleLabour',
    {
      id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
      saleId: { type: DataTypes.STRING(24), allowNull: false, field: 'sale_id' },
      position: { type: DataTypes.INTEGER, allowNull: false },
      labour: { type: DataTypes.STRING(24), allowNull: false, field: 'labour_id' },
      name: { type: DataTypes.STRING(100), allowNull: false },
      phoneNumber: { type: DataTypes.STRING(30), allowNull: false, defaultValue: '' },
    },
    { tableName: 'sale_labour', timestamps: false },
  );

  const GoodsPurchase = define(
    'GoodsPurchase',
    {
      id: id(),
      number: { type: DataTypes.STRING(100), allowNull: false, unique: true },
      vendorInvoiceNo: { type: DataTypes.STRING(100), allowNull: false, defaultValue: '' },
      vendor: { type: DataTypes.STRING(24), allowNull: false, field: 'vendor_id' },
      vendorName: { type: DataTypes.STRING(120), allowNull: false, defaultValue: '' },
      warehouse: { type: DataTypes.STRING(24), allowNull: false, field: 'warehouse_id' },
      date: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
      subtotal: money(),
      discount: money(),
      tax: money(),
      total: money({ defaultValue: undefined }),
      paid: money(),
      balance: money({ signed: true }),
      paymentMethod: {
        type: DataTypes.STRING(30),
        validate: { isIn: [PAYMENT_METHODS] },
      },
      bankAccount: { type: DataTypes.STRING(24), field: 'bank_account_id' },
      notes: { type: DataTypes.TEXT, allowNull: false, defaultValue: '' },
      createdBy: { type: DataTypes.STRING(24), field: 'created_by_id' },
      gatePass: { type: DataTypes.STRING(24), field: 'gate_pass_id' },
    },
    { tableName: 'goods_purchases' },
  );
  const GoodsPurchaseItem = define(
    'GoodsPurchaseItem',
    {
      id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
      purchaseId: { type: DataTypes.STRING(24), allowNull: false, field: 'purchase_id' },
      position: { type: DataTypes.INTEGER, allowNull: false },
      product: { type: DataTypes.STRING(24), allowNull: false, field: 'product_id' },
      name: { type: DataTypes.STRING(160), allowNull: false },
      quantity: quantity({ defaultValue: undefined }),
      unitCost: money({ defaultValue: undefined }),
      taxPercent: { type: DataTypes.DECIMAL(9, 4), allowNull: false, defaultValue: 0 },
      tax: money(),
      lineTotal: money({ defaultValue: undefined }),
    },
    { tableName: 'goods_purchase_items', timestamps: false },
  );

  const Invoice = define(
    'Invoice',
    {
      id: id(),
      type: { type: DataTypes.STRING(20), allowNull: false, defaultValue: 'PURCHASE' },
      purchase: { type: DataTypes.STRING(24), allowNull: false, field: 'purchase_id' },
      number: { type: DataTypes.STRING(100), allowNull: false, unique: true },
      vendorInvoiceNo: { type: DataTypes.STRING(100), allowNull: false, defaultValue: '' },
      vendor: { type: DataTypes.STRING(24), allowNull: false, field: 'vendor_id' },
      vendorName: { type: DataTypes.STRING(120), allowNull: false, defaultValue: '' },
      warehouse: { type: DataTypes.STRING(24), allowNull: false, field: 'warehouse_id' },
      date: { type: DataTypes.DATE, allowNull: false },
      subtotal: money({ defaultValue: undefined }),
      discount: money(),
      tax: money(),
      total: money({ defaultValue: undefined }),
      paid: money(),
      balance: money(),
      status: {
        type: DataTypes.ENUM('UNPAID', 'PARTIAL', 'PAID'),
        allowNull: false,
        defaultValue: 'UNPAID',
      },
      notes: { type: DataTypes.TEXT, allowNull: false, defaultValue: '' },
      createdBy: { type: DataTypes.STRING(24), field: 'created_by_id' },
      gatePass: { type: DataTypes.STRING(24), field: 'gate_pass_id' },
    },
    { tableName: 'invoices' },
  );
  const InvoiceItem = define(
    'InvoiceItem',
    {
      id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
      invoiceId: { type: DataTypes.STRING(24), allowNull: false, field: 'invoice_id' },
      position: { type: DataTypes.INTEGER, allowNull: false },
      product: { type: DataTypes.STRING(24), allowNull: false, field: 'product_id' },
      name: { type: DataTypes.STRING(160), allowNull: false },
      quantity: quantity({ defaultValue: undefined }),
      unitCost: money({ defaultValue: undefined }),
      taxPercent: { type: DataTypes.DECIMAL(9, 4), allowNull: false, defaultValue: 0 },
      tax: money(),
      lineTotal: money({ defaultValue: undefined }),
    },
    { tableName: 'invoice_items', timestamps: false },
  );

  const JournalEntry = define(
    'JournalEntry',
    {
      id: id(),
      date: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
      description: { type: DataTypes.TEXT, allowNull: false, defaultValue: '' },
      refType: {
        type: DataTypes.STRING(30),
        allowNull: false,
        validate: { isIn: [Object.values(REF)] },
      },
      refId: { type: DataTypes.STRING(24) },
      refNo: { type: DataTypes.STRING(100), allowNull: false, defaultValue: '' },
      warehouse: { type: DataTypes.STRING(24), field: 'warehouse_id' },
      createdBy: { type: DataTypes.STRING(24), field: 'created_by_id' },
    },
    { tableName: 'journal_entries' },
  );
  const JournalLine = define(
    'JournalLine',
    {
      id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
      journalEntryId: {
        type: DataTypes.STRING(24),
        allowNull: false,
        field: 'journal_entry_id',
      },
      position: { type: DataTypes.INTEGER, allowNull: false },
      account: {
        type: DataTypes.STRING(30),
        allowNull: false,
        validate: { isIn: [ACCOUNT_KINDS] },
      },
      ref: { type: DataTypes.STRING(24), field: 'ref_id' },
      debit: money(),
      credit: money(),
    },
    { tableName: 'journal_lines', timestamps: false },
  );

  const Counter = db.define(
    'Counter',
    {
      key: { type: DataTypes.STRING(30), primaryKey: true },
      scope: { type: DataTypes.STRING(30), primaryKey: true, defaultValue: '' },
      seq: { type: DataTypes.BIGINT, allowNull: false, defaultValue: 0 },
    },
    { tableName: 'counters', timestamps: false, underscored: true },
  );
  const Settings = define(
    'Settings',
    {
      id: id(),
      key: { type: DataTypes.STRING(30), allowNull: false, defaultValue: 'app', unique: true },
      companyName: { type: DataTypes.STRING(160), allowNull: false, defaultValue: '' },
      address: { type: DataTypes.STRING(300), allowNull: false, defaultValue: '' },
      phone: { type: DataTypes.STRING(30), allowNull: false, defaultValue: '' },
      email: { type: DataTypes.STRING(120), allowNull: false, defaultValue: '' },
      taxNumber: { type: DataTypes.STRING(60), allowNull: false, defaultValue: '' },
      currency: { type: DataTypes.STRING(10), allowNull: false, defaultValue: 'PKR' },
    },
    { tableName: 'settings' },
  );

  const GatePass = define(
    'GatePass',
    {
      id: id(),
      number: { type: DataTypes.STRING(100), allowNull: false, unique: true },
      token: { type: DataTypes.STRING, allowNull: false, unique: true },
      sourceType: { type: DataTypes.ENUM('SALE', 'PURCHASE'), allowNull: false },
      sale: { type: DataTypes.STRING(24), field: 'sale_id' },
      purchase: { type: DataTypes.STRING(24), field: 'purchase_id' },
      documentNumber: { type: DataTypes.STRING(100), allowNull: false },
      warehouse: { type: DataTypes.STRING(24), allowNull: false, field: 'warehouse_id' },
      saleDate: { type: DataTypes.DATE, allowNull: false },
      customer: { type: DataTypes.STRING(24), field: 'customer_id' },
      customerName: DataTypes.STRING(120),
      customerPhone: { type: DataTypes.STRING(30), allowNull: false, defaultValue: '' },
      customerEmail: { type: DataTypes.STRING(120), allowNull: false, defaultValue: '' },
      customerAddress: { type: DataTypes.STRING(300), allowNull: false, defaultValue: '' },
      vendor: { type: DataTypes.STRING(24), field: 'vendor_id' },
      vendorName: DataTypes.STRING(120),
      vendorPhone: { type: DataTypes.STRING(30), allowNull: false, defaultValue: '' },
      vendorEmail: { type: DataTypes.STRING(120), allowNull: false, defaultValue: '' },
      vendorAddress: { type: DataTypes.STRING(300), allowNull: false, defaultValue: '' },
      pricingSubtotal: DataTypes.BIGINT,
      pricingDiscount: DataTypes.BIGINT,
      pricingTaxPercent: DataTypes.DECIMAL(9, 4),
      pricingTax: DataTypes.BIGINT,
      pricingTotal: DataTypes.BIGINT,
      status: {
        type: DataTypes.ENUM('PENDING', 'PROCESSED', 'CANCELLED'),
        allowNull: false,
        defaultValue: 'PENDING',
      },
      driver: { type: DataTypes.JSONB },
      loadNotes: { type: DataTypes.TEXT, allowNull: false, defaultValue: '' },
      signatureData: { type: DataTypes.TEXT },
      processedAt: DataTypes.DATE,
      processedBy: { type: DataTypes.STRING(24), field: 'processed_by_id' },
      lastEditedAt: DataTypes.DATE,
      lastEditedBy: { type: DataTypes.STRING(24), field: 'last_edited_by_id' },
      createdBy: { type: DataTypes.STRING(24), field: 'created_by_id' },
    },
    { tableName: 'gate_passes' },
  );
  const GatePassItem = define(
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

  models = {
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
    Labour,
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
    Counter,
    Settings,
    GatePass,
    GatePassItem,
  };

  for (const model of Object.values(models)) {
    const hidden = model === User ? ['password', 'passwordResetToken', 'passwordResetExpires'] : [];
    Object.defineProperty(model.prototype, '_id', {
      configurable: true,
      get() {
        return this.getDataValue('id');
      },
    });
    model.prototype.toJSON = function toJSON() {
      return publicJson(this, hidden);
    };
  }

  return models;
}

module.exports = { initializeModels };
