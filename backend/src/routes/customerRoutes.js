const express = require('express');
const customerController = require('../controllers/customerController');
const { protect } = require('../middlewares/authMiddleware');
const { requirePermission } = require('../middlewares/roleMiddleware');
const { validate } = require('../middlewares/validateMiddleware');
const { PERMISSIONS } = require('../utils/permissions');
const {
  createCustomerValidator,
  updateCustomerValidator,
  idParamValidator,
} = require('../validators/customerValidator');

const router = express.Router();

// Every route here requires authentication.
router.use(protect);

router.get('/', requirePermission(PERMISSIONS.CUSTOMERS_READ), customerController.listCustomers);
router.get(
  '/:id',
  requirePermission(PERMISSIONS.CUSTOMERS_READ),
  idParamValidator,
  validate,
  customerController.getCustomer,
);

router.post(
  '/',
  requirePermission(PERMISSIONS.CUSTOMERS_CREATE),
  createCustomerValidator,
  validate,
  customerController.createCustomer,
);
router.patch(
  '/:id',
  requirePermission(PERMISSIONS.CUSTOMERS_UPDATE),
  updateCustomerValidator,
  validate,
  customerController.updateCustomer,
);
router.delete(
  '/:id',
  requirePermission(PERMISSIONS.CUSTOMERS_DELETE),
  idParamValidator,
  validate,
  customerController.deleteCustomer,
);

module.exports = router;
