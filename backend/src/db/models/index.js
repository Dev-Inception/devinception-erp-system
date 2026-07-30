const { getPostgres } = require('../postgres');
const { addPublicSerialization } = require('./helpers');
const { associateModels } = require('./associations');

const modelFactories = {
  Role: require('./roleModel'),
  User: require('./userModel'),
  Warehouse: require('./warehouseModel'),
  Category: require('./categoryModel'),
  Brand: require('./brandModel'),
  Unit: require('./unitModel'),
  Product: require('./productModel'),
  Customer: require('./customerModel'),
  Vendor: require('./vendorModel'),
  BankAccount: require('./bankAccountModel'),
  Labour: require('./labourModel'),
  StockLevel: require('./stockLevelModel'),
  StockMovement: require('./stockMovementModel'),
  Sale: require('./saleModel'),
  SaleItem: require('./saleItemModel'),
  SaleLabour: require('./saleLabourModel'),
  GoodsPurchase: require('./goodsPurchaseModel'),
  GoodsPurchaseItem: require('./goodsPurchaseItemModel'),
  Invoice: require('./invoiceModel'),
  InvoiceItem: require('./invoiceItemModel'),
  JournalEntry: require('./journalEntryModel'),
  JournalLine: require('./journalLineModel'),
  Counter: require('./counterModel'),
  Settings: require('./settingsModel'),
  GatePass: require('./gatePassModel'),
  GatePassItem: require('./gatePassItemModel'),
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
    const hidden =
      name === 'User' ? ['password', 'passwordResetToken', 'passwordResetExpires'] : [];
    addPublicSerialization(model, hidden);
  }

  return models;
}

module.exports = { initializeModels };
