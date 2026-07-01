const express = require('express');
const financeController = require('../controllers/financeController');
const { protect } = require('../middlewares/authMiddleware');
const { requirePermission } = require('../middlewares/roleMiddleware');
const { validate } = require('../middlewares/validateMiddleware');
const { PERMISSIONS } = require('../utils/permissions');
const {
  createBankAccountValidator,
  updateBankAccountValidator,
  payVendorValidator,
  receiveCustomerValidator,
  cashEntryValidator,
  statementParamValidator,
  idParamValidator,
} = require('../validators/financeValidator');

const router = express.Router();
router.use(protect);

const READ = requirePermission(PERMISSIONS.FINANCE_READ);
const MANAGE = requirePermission(PERMISSIONS.FINANCE_MANAGE);

/* Bank accounts */
router.get('/bank-accounts', READ, financeController.listBankAccounts);
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

/* Payments */
router.post('/payments/vendor', MANAGE, payVendorValidator, validate, financeController.payVendor);
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
router.get(
  '/ledgers/:kind/:id',
  READ,
  statementParamValidator,
  validate,
  financeController.partyStatement,
);

module.exports = router;
