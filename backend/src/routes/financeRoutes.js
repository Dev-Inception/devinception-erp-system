const express = require('express');
const financeController = require('../controllers/financeController');
const { protect } = require('../middlewares/authMiddleware');
const { requirePermission, requireAnyPermission } = require('../middlewares/roleMiddleware');
const { validate } = require('../middlewares/validateMiddleware');
const { PERMISSIONS } = require('../utils/permissions');
const {
  createBankAccountValidator,
  updateBankAccountValidator,
  payVendorValidator,
  paySupplierValidator,
  payLabourValidator,
  payTransportValidator,
  receiveCustomerValidator,
  cashEntryValidator,
  expenseValidator,
  statementParamValidator,
  idParamValidator,
} = require('../validators/financeValidator');

const router = express.Router();
router.use(protect);

const READ = requirePermission(PERMISSIONS.FINANCE_READ);
const MANAGE = requirePermission(PERMISSIONS.FINANCE_MANAGE);
// Any role that can pick a bank account somewhere (expenses, payments,
// finance), or that can print an invoice showing the store's bank details
// (sales), needs to be able to list them — regardless of which one
// permission actually got them to that screen.
const READ_BANK_ACCOUNTS = requireAnyPermission(
  PERMISSIONS.FINANCE_READ,
  PERMISSIONS.FINANCE_MANAGE,
  PERMISSIONS.EXPENSES_MANAGE,
  PERMISSIONS.SALES_READ,
);

/* Bank accounts */
router.get('/bank-accounts', READ_BANK_ACCOUNTS, financeController.listBankAccounts);
router.post(
  '/bank-accounts',
  MANAGE,
  createBankAccountValidator,
  validate,
  financeController.createBankAccount,
);
router.patch(
  '/bank-accounts/:id',
  MANAGE,
  updateBankAccountValidator,
  validate,
  financeController.updateBankAccount,
);
router.delete(
  '/bank-accounts/:id',
  MANAGE,
  idParamValidator,
  validate,
  financeController.deleteBankAccount,
);
router.get(
  '/bank-accounts/:id/ledger',
  READ,
  idParamValidator,
  validate,
  financeController.bankLedger,
);

/* Cash book */
router.get('/cash-ledger', READ, financeController.cashLedger);
router.post('/cash-entry', MANAGE, cashEntryValidator, validate, financeController.cashEntry);
router.post('/expenses', MANAGE, expenseValidator, validate, financeController.recordExpense);

/* Payments */
router.post('/payments/vendor', MANAGE, payVendorValidator, validate, financeController.payVendor);
router.post(
  '/payments/supplier',
  MANAGE,
  paySupplierValidator,
  validate,
  financeController.paySupplier,
);
router.post('/payments/labour', MANAGE, payLabourValidator, validate, financeController.payLabour);
router.post(
  '/payments/transport',
  MANAGE,
  payTransportValidator,
  validate,
  financeController.payTransport,
);
router.post(
  '/payments/customer',
  MANAGE,
  receiveCustomerValidator,
  validate,
  financeController.receiveFromCustomer,
);

/* Ledgers (party statements) */
router.get('/ledgers/customers', READ, financeController.customerLedgers);
router.get('/ledgers/vendors', READ, financeController.vendorLedgers);
router.get('/ledgers/suppliers', READ, financeController.supplierLedgers);
router.get('/ledgers/labour', READ, financeController.labourLedgers);
router.get('/ledgers/transport', READ, financeController.transporterLedgers);
router.get(
  '/ledgers/:kind/:id',
  READ,
  statementParamValidator,
  validate,
  financeController.partyStatement,
);

module.exports = router;
