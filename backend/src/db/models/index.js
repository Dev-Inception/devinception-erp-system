const { getPostgres } = require('../postgres');
const { addPublicSerialization } = require('./helpers');
const { associateModels } = require('./associations');

const modelFactories = {
  Role: require('./roleModel'),
  User: require('./userModel'),
  Store: require('./storeModel'),
  Warehouse: require('./warehouseModel'),
  StoreWarehouse: require('./storeWarehouseModel'),
  Category: require('./categoryModel'),
  Brand: require('./brandModel'),
  Unit: require('./unitModel'),
  ExpenseCategory: require('./expenseCategoryModel'),
  Product: require('./productModel'),
  Customer: require('./customerModel'),
  Vendor: require('./vendorModel'),
  Supplier: require('./supplierModel'),
  Transporter: require('./transporterModel'),
  BankAccount: require('./bankAccountModel'),
  Labour: require('./labourModel'),
  StockLevel: require('./stockLevelModel'),
  StockMovement: require('./stockMovementModel'),
  Sale: require('./saleModel'),
  SaleItem: require('./saleItemModel'),
  SaleLabour: require('./saleLabourModel'),
  SaleWarehouseGatePass: require('./saleWarehouseGatePassModel'),
  SaleDraft: require('./saleDraftModel'),
  SaleReturn: require('./saleReturnModel'),
  SaleReturnItem: require('./saleReturnItemModel'),
  ReturnWarehouseGatePass: require('./returnWarehouseGatePassModel'),
  StockReceipt: require('./stockReceiptModel'),
  StockReceiptItem: require('./stockReceiptItemModel'),
  StockReceiptLabour: require('./stockReceiptLabourModel'),
  Estimate: require('./estimateModel'),
  EstimateItem: require('./estimateItemModel'),
  EstimateFollowUp: require('./estimateFollowUpModel'),
  PendingEntity: require('./pendingEntityModel'),
  GatePass: require('./gatePassModel'),
  GatePassItem: require('./gatePassItemModel'),
  Expense: require('./expenseModel'),
  DayEnd: require('./dayEndModel'),
  JournalEntry: require('./journalEntryModel'),
  JournalLine: require('./journalLineModel'),
  Counter: require('./counterModel'),
  Settings: require('./settingsModel'),
};

// Per-model hidden fields for toJSON, mirroring each Mongoose schema's
// `select: false` / transform-deleted fields.
const HIDDEN_FIELDS = {
  User: [
    'password',
    'passwordResetToken',
    'passwordResetExpires',
    'passwordChangedAt',
    'tokenVersion',
  ],
  GatePass: ['token', 'signatureData'],
};

let models;

function initializeModels() {
  if (models) return models;

  const db = getPostgres();
  models = Object.fromEntries(
    Object.entries(modelFactories).map(([name, createModel]) => [name, createModel(db)]),
  );
  associateModels(models);

  for (const [name, model] of Object.entries(models)) {
    addPublicSerialization(model, HIDDEN_FIELDS[name] || []);
  }

  return models;
}

module.exports = { initializeModels };
