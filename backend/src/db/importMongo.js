const mongoose = require('mongoose');
const env = require('../config/env');
const { getPostgres, closePostgres } = require('./postgres');
const { initializeModels } = require('./models');

const legacy = {
  Role: require('../models/roleModel'),
  User: require('../models/userModel'),
  Warehouse: require('../models/warehouseModel'),
  Category: require('../models/categoryModel'),
  Brand: require('../models/brandModel'),
  Unit: require('../models/unitModel'),
  Product: require('../models/productModel'),
  Customer: require('../models/customerModel'),
  Vendor: require('../models/vendorModel'),
  BankAccount: require('../models/bankAccountModel'),
  Labour: require('../models/labourModel'),
  StockLevel: require('../models/stockLevelModel'),
  StockMovement: require('../models/stockMovementModel'),
  Sale: require('../models/saleModel'),
  GoodsPurchase: require('../models/goodsPurchaseModel'),
  Invoice: require('../models/invoiceModel'),
  JournalEntry: require('../models/journalEntryModel'),
  Counter: require('../models/counterModel'),
  Settings: require('../models/settingsModel'),
  GatePass: require('../models/gatePassModel'),
};

const target = initializeModels();
const sid = (value) => (value ? String(value._id || value) : null);
const timestamps = (doc) => ({
  createdAt: doc.createdAt || new Date(),
  updatedAt: doc.updatedAt || new Date(),
});

async function docs(model, selection = '') {
  let query = model.find();
  if (selection) query = query.select(selection);
  return query.lean();
}

async function insert(Model, rows, transaction) {
  if (!rows.length) return;
  await Model.bulkCreate(rows, { transaction, validate: false, hooks: false });
}

async function assertEmpty() {
  const populated = [];
  for (const name of ['Role', 'User', 'Product', 'Sale', 'GoodsPurchase', 'JournalEntry']) {
    if ((await target[name].count()) > 0) populated.push(target[name].tableName);
  }
  if (populated.length) {
    throw new Error(
      `PostgreSQL target must be empty before import. Data found in: ${populated.join(', ')}`,
    );
  }
}

async function loadSource() {
  const entries = await Promise.all(
    Object.entries(legacy).map(async ([name, model]) => [
      name,
      await docs(
        model,
        name === 'User'
          ? '+password +passwordResetToken +passwordResetExpires +passwordChangedAt'
          : name === 'GatePass'
            ? '+token +signatureData'
            : '',
      ),
    ]),
  );
  return Object.fromEntries(entries);
}

async function importData(source) {
  return getPostgres().transaction(async (transaction) => {
    const baseMap = {
      Role: (d) => ({
        id: sid(d),
        name: d.name,
        description: d.description || '',
        permissions: d.permissions || [],
        isSystem: !!d.isSystem,
        ...timestamps(d),
      }),
      User: (d) => ({
        id: sid(d),
        name: d.name,
        email: d.email,
        password: d.password,
        role: d.role,
        isActive: d.isActive !== false,
        passwordResetToken: d.passwordResetToken || null,
        passwordResetExpires: d.passwordResetExpires || null,
        passwordChangedAt: d.passwordChangedAt || null,
        ...timestamps(d),
      }),
      Warehouse: (d) => ({
        id: sid(d),
        name: d.name,
        location: d.location || '',
        address: d.address || '',
        isDefault: !!d.isDefault,
        isActive: d.isActive !== false,
        ...timestamps(d),
      }),
      Category: (d) => ({
        id: sid(d),
        name: d.name,
        description: d.description || '',
        isActive: d.isActive !== false,
        ...timestamps(d),
      }),
      Brand: (d) => ({
        id: sid(d),
        name: d.name,
        isActive: d.isActive !== false,
        ...timestamps(d),
      }),
      Unit: (d) => ({
        id: sid(d),
        name: d.name,
        abbreviation: d.abbreviation || '',
        isActive: d.isActive !== false,
        ...timestamps(d),
      }),
      Customer: (d) => ({
        id: sid(d),
        name: d.name,
        phone: d.phone || '',
        email: d.email || '',
        address: d.address || '',
        creditLimit: d.creditLimit || 0,
        outstanding: d.outstanding || 0,
        ...timestamps(d),
      }),
      Vendor: (d) => ({
        id: sid(d),
        name: d.name,
        phone: d.phone || '',
        email: d.email || '',
        ntn: d.ntn || '',
        address: d.address || '',
        outstanding: d.outstanding || 0,
        ...timestamps(d),
      }),
      BankAccount: (d) => ({
        id: sid(d),
        name: d.name,
        bankName: d.bankName || '',
        accountNumber: d.accountNumber || '',
        isActive: d.isActive !== false,
        ...timestamps(d),
      }),
      Labour: (d) => ({ id: sid(d), name: d.name, phoneNumber: d.phoneNumber, ...timestamps(d) }),
    };

    for (const name of [
      'Role',
      'Warehouse',
      'Category',
      'Brand',
      'Unit',
      'User',
      'Customer',
      'Vendor',
      'BankAccount',
      'Labour',
    ]) {
      await insert(target[name], source[name].map(baseMap[name]), transaction);
    }

    await insert(
      target.Product,
      source.Product.map((d) => ({
        id: sid(d),
        name: d.name,
        sku: d.sku || '',
        barcode: d.barcode || '',
        warehouse: sid(d.warehouse),
        category: sid(d.category),
        brand: sid(d.brand),
        unit: sid(d.unit),
        purchasePrice: d.purchasePrice || 0,
        salePrice: d.salePrice || 0,
        taxPercent: d.taxPercent || 0,
        minStock: d.minStock || 0,
        isActive: d.isActive !== false,
        ...timestamps(d),
      })),
      transaction,
    );

    await insert(
      target.StockLevel,
      source.StockLevel.map((d) => ({
        id: sid(d),
        product: sid(d.product),
        warehouse: sid(d.warehouse),
        quantity: d.quantity || 0,
        avgCost: d.avgCost || 0,
        ...timestamps(d),
      })),
      transaction,
    );
    await insert(
      target.StockMovement,
      source.StockMovement.map((d) => ({
        id: sid(d),
        product: sid(d.product),
        warehouse: sid(d.warehouse),
        type: d.type,
        quantity: d.quantity,
        unitCost: d.unitCost || 0,
        totalCost: d.totalCost ?? null,
        refType: d.refType || '',
        refNo: d.refNo || '',
        date: d.date || d.createdAt,
        ...timestamps(d),
      })),
      transaction,
    );

    for (const d of source.Sale) {
      await target.Sale.create(
        {
          id: sid(d),
          number: d.number,
          customer: sid(d.customer),
          customerName: d.customerName || 'Walk-in',
          warehouse: sid(d.warehouse),
          date: d.date,
          subtotal: d.subtotal,
          discount: d.discount || 0,
          taxPercent: d.taxPercent || 0,
          tax: d.tax || 0,
          total: d.total,
          cost: d.cost || 0,
          paymentMethod: d.paymentMethod,
          cashAmount: d.cashAmount || 0,
          onlineAmount: d.onlineAmount || 0,
          creditAmount: d.creditAmount || 0,
          bankAccount: sid(d.bankAccount),
          transferReceiptRef: d.transferReceiptRef || '',
          gatePass: null,
          createdBy: sid(d.createdBy),
          ...timestamps(d),
        },
        { transaction, hooks: false },
      );
      await insert(
        target.SaleItem,
        (d.items || []).map((item, position) => ({
          saleId: sid(d),
          position,
          product: sid(item.product),
          name: item.name,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          lineTotal: item.lineTotal,
          cost: item.cost || 0,
        })),
        transaction,
      );
      await insert(
        target.SaleLabour,
        (d.labour || []).map((item, position) => ({
          saleId: sid(d),
          position,
          labour: sid(item.labour),
          name: item.name,
          phoneNumber: item.phoneNumber || '',
        })),
        transaction,
      );
    }

    for (const d of source.GoodsPurchase) {
      await target.GoodsPurchase.create(
        {
          id: sid(d),
          number: d.number,
          vendorInvoiceNo: d.vendorInvoiceNo || '',
          vendor: sid(d.vendor),
          vendorName: d.vendorName || '',
          warehouse: sid(d.warehouse),
          date: d.date,
          subtotal: d.subtotal || 0,
          discount: d.discount || 0,
          tax: d.tax || 0,
          total: d.total,
          paid: d.paid || 0,
          balance: d.balance || 0,
          paymentMethod: d.paymentMethod || null,
          bankAccount: sid(d.bankAccount),
          notes: d.notes || '',
          createdBy: sid(d.createdBy),
          gatePass: null,
          ...timestamps(d),
        },
        { transaction, hooks: false },
      );
      await insert(
        target.GoodsPurchaseItem,
        (d.items || []).map((item, position) => ({
          purchaseId: sid(d),
          position,
          product: sid(item.product),
          name: item.name,
          quantity: item.quantity,
          unitCost: item.unitCost,
          taxPercent: item.taxPercent || 0,
          tax: item.tax || 0,
          lineTotal: item.lineTotal,
        })),
        transaction,
      );
    }

    for (const d of source.Invoice.filter((item) => item.purchase)) {
      await target.Invoice.create(
        {
          id: sid(d),
          type: 'PURCHASE',
          purchase: sid(d.purchase),
          number: d.number,
          vendorInvoiceNo: d.vendorInvoiceNo || '',
          vendor: sid(d.vendor),
          vendorName: d.vendorName || '',
          warehouse: sid(d.warehouse),
          date: d.date,
          subtotal: d.subtotal,
          discount: d.discount || 0,
          tax: d.tax || 0,
          total: d.total,
          paid: d.paid || 0,
          balance: d.balance || 0,
          status: d.status || 'UNPAID',
          notes: d.notes || '',
          createdBy: sid(d.createdBy),
          gatePass: null,
          ...timestamps(d),
        },
        { transaction, hooks: false },
      );
      await insert(
        target.InvoiceItem,
        (d.items || []).map((item, position) => ({
          invoiceId: sid(d),
          position,
          product: sid(item.product),
          name: item.name,
          quantity: item.quantity,
          unitCost: item.unitCost,
          taxPercent: item.taxPercent || 0,
          tax: item.tax || 0,
          lineTotal: item.lineTotal,
        })),
        transaction,
      );
    }

    for (const d of source.JournalEntry) {
      await target.JournalEntry.create(
        {
          id: sid(d),
          date: d.date,
          description: d.description || '',
          refType: d.refType,
          refId: sid(d.refId),
          refNo: d.refNo || '',
          warehouse: sid(d.warehouse),
          createdBy: sid(d.createdBy),
          ...timestamps(d),
        },
        { transaction, hooks: false },
      );
      await insert(
        target.JournalLine,
        (d.lines || []).map((line, position) => ({
          journalEntryId: sid(d),
          position,
          account: line.account,
          ref: sid(line.ref),
          debit: line.debit || 0,
          credit: line.credit || 0,
        })),
        transaction,
      );
    }

    await insert(
      target.Settings,
      source.Settings.map((d) => ({
        id: sid(d),
        key: d.key || 'app',
        companyName: d.companyName || '',
        address: d.address || '',
        phone: d.phone || '',
        email: d.email || '',
        taxNumber: d.taxNumber || '',
        currency: d.currency || 'PKR',
        ...timestamps(d),
      })),
      transaction,
    );
    await insert(
      target.Counter,
      source.Counter.map((d) => ({
        key: d.key,
        scope: d.scope || '',
        seq: d.seq || 0,
      })),
      transaction,
    );

    const salesById = new Map(source.Sale.map((row) => [sid(row), row]));
    const purchasesById = new Map(source.GoodsPurchase.map((row) => [sid(row), row]));
    const customersById = new Map(source.Customer.map((row) => [sid(row), row]));
    const vendorsById = new Map(source.Vendor.map((row) => [sid(row), row]));

    for (const d of source.GatePass) {
      const sale = salesById.get(sid(d.sale));
      const purchase = purchasesById.get(sid(d.purchase));
      const customerDoc = sale ? customersById.get(sid(sale.customer)) : null;
      const vendorDoc = purchase ? vendorsById.get(sid(purchase.vendor)) : null;
      const customer = d.customerInfo || customerDoc || {};
      const vendor = d.vendorInfo || vendorDoc || {};
      const pricing =
        d.pricing ||
        (sale
          ? {
              subtotal: sale.subtotal,
              discount: sale.discount,
              taxPercent: sale.taxPercent,
              tax: sale.tax,
              total: sale.total,
            }
          : {
              subtotal: purchase?.subtotal,
              discount: purchase?.discount,
              taxPercent: 0,
              tax: purchase?.tax,
              total: purchase?.total,
            });
      const sourceItems = sale?.items || purchase?.items || [];
      const status =
        d.status === 'ACTIVE' ? 'PENDING' : d.status === 'USED' ? 'PROCESSED' : d.status;
      await target.GatePass.create(
        {
          id: sid(d),
          number: d.number,
          token: d.token,
          sourceType: d.sourceType || 'SALE',
          sale: sid(d.sale),
          purchase: sid(d.purchase),
          documentNumber: d.documentNumber,
          warehouse: sid(d.warehouse),
          saleDate: d.saleDate,
          customer: sid(customer.customer || customerDoc),
          customerName: customer.name || null,
          customerPhone: customer.phone || '',
          customerEmail: customer.email || '',
          customerAddress: customer.address || '',
          vendor: sid(vendor.vendor || vendorDoc),
          vendorName: vendor.name || null,
          vendorPhone: vendor.phone || '',
          vendorEmail: vendor.email || '',
          vendorAddress: vendor.address || '',
          pricingSubtotal: pricing.subtotal ?? null,
          pricingDiscount: pricing.discount ?? null,
          pricingTaxPercent: pricing.taxPercent ?? null,
          pricingTax: pricing.tax ?? null,
          pricingTotal: pricing.total ?? null,
          status: status || 'PENDING',
          driver: d.driver || null,
          loadNotes: d.loadNotes || '',
          signatureData: d.signatureData || null,
          processedAt: d.processedAt || d.scannedAt || null,
          processedBy: sid(d.processedBy || d.scannedBy),
          lastEditedAt: d.lastEditedAt || null,
          lastEditedBy: sid(d.lastEditedBy),
          createdBy: sid(d.createdBy),
          ...timestamps(d),
        },
        { transaction, hooks: false },
      );
      await insert(
        target.GatePassItem,
        (d.items || []).map((item, position) => {
          const sourceItem = sourceItems[position] || {};
          return {
            gatePassId: sid(d),
            position,
            product: sid(item.product),
            name: item.name,
            sku: item.sku || '',
            barcode: item.barcode || '',
            quantity: item.quantity,
            unitPrice: item.unitPrice ?? sourceItem.unitPrice ?? sourceItem.unitCost ?? null,
            lineTotal: item.lineTotal ?? sourceItem.lineTotal ?? null,
            loadedQuantity: item.loadedQuantity ?? null,
            loadConfirmed: !!item.loadConfirmed,
          };
        }),
        transaction,
      );
    }

    for (const d of source.GatePass) {
      if (d.sale)
        await target.Sale.update({ gatePass: sid(d) }, { where: { id: sid(d.sale) }, transaction });
      if (d.purchase) {
        await target.GoodsPurchase.update(
          { gatePass: sid(d) },
          { where: { id: sid(d.purchase) }, transaction },
        );
        await target.Invoice.update(
          { gatePass: sid(d) },
          { where: { purchase: sid(d.purchase) }, transaction },
        );
      }
    }
  });
}

async function reconcile(source) {
  const checks = {
    roles: [source.Role.length, await target.Role.count()],
    users: [source.User.length, await target.User.count()],
    products: [source.Product.length, await target.Product.count()],
    stockLevels: [source.StockLevel.length, await target.StockLevel.count()],
    sales: [source.Sale.length, await target.Sale.count()],
    purchases: [source.GoodsPurchase.length, await target.GoodsPurchase.count()],
    journalEntries: [source.JournalEntry.length, await target.JournalEntry.count()],
    gatePasses: [source.GatePass.length, await target.GatePass.count()],
  };
  const mismatches = Object.entries(checks).filter(([, [mongo, postgres]]) => mongo !== postgres);
  if (mismatches.length)
    throw new Error(`Reconciliation failed: ${JSON.stringify(Object.fromEntries(mismatches))}`);
  // eslint-disable-next-line no-console
  console.log('Import reconciliation passed:', checks);
}

async function run() {
  if (!env.mongoUri) throw new Error('MONGO_URI is required only while importing legacy data');
  await getPostgres().authenticate();
  await assertEmpty();
  await mongoose.connect(env.mongoUri);
  const source = await loadSource();
  await importData(source);
  await reconcile(source);
}

run()
  .catch((error) => {
    // eslint-disable-next-line no-console
    console.error('MongoDB import failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
    await closePostgres();
  });
