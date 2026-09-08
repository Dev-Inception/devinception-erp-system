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

// Reshapes flattened columns back into the nested object shape the old
// Mongoose subdocument had, so response payloads stay contract-compatible.
const TRANSFORMS = {
  Sale: (values) => {
    const hasTransport =
      values.transportDriverName || values.transportDriverPhone || values.transportVehicleNumber;
    values.transport = hasTransport
      ? {
          driverName: values.transportDriverName || '',
          driverPhone: values.transportDriverPhone || '',
          vehicleNumber: values.transportVehicleNumber || '',
        }
      : undefined;
    delete values.transportDriverName;
    delete values.transportDriverPhone;
    delete values.transportVehicleNumber;
    return values;
  },
  GatePass: (values) => {
    const hasDriver = values.driverName || values.driverVehicleNumber;
    values.driver = hasDriver
      ? {
          name: values.driverName || '',
          phone: values.driverPhone || '',
          licenseNumber: values.driverLicenseNumber || '',
          vehicleNumber: values.driverVehicleNumber || '',
        }
      : null;
    delete values.driverName;
    delete values.driverPhone;
    delete values.driverLicenseNumber;
    delete values.driverVehicleNumber;
    return values;
  },
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
    addPublicSerialization(model, HIDDEN_FIELDS[name] || [], TRANSFORMS[name]);
  }

  return models;
}

module.exports = { initializeModels };
