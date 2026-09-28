const express = require('express');
const pendingEntityController = require('../controllers/pendingEntityController');
const { protect } = require('../middlewares/authMiddleware');
const { requirePermission } = require('../middlewares/roleMiddleware');
const { validate } = require('../middlewares/validateMiddleware');
const { PERMISSIONS } = require('../utils/permissions');
const {
  idParamValidator,
  setPriceValidator,
  invoiceItemsValidator,
} = require('../validators/pendingEntityValidator');

const router = express.Router();

// Every route here requires authentication.
router.use(protect);

router.get(
  '/',
  requirePermission(PERMISSIONS.FINANCE_READ),
  pendingEntityController.listPendingEntities,
);

// Order matters: these must come before /:id so "invoices"/"invoice-items"
// aren't swallowed as an :id.
router.get(
  '/invoices',
  requirePermission(PERMISSIONS.FINANCE_READ),
  pendingEntityController.listInvoices,
);

router.get(
  '/invoice-items',
  requirePermission(PERMISSIONS.FINANCE_READ),
  invoiceItemsValidator,
  validate,
  pendingEntityController.getInvoiceItems,
);

router.get(
  '/:id',
  requirePermission(PERMISSIONS.FINANCE_READ),
  idParamValidator,
  validate,
  pendingEntityController.getPendingEntity,
);

// Putting a price on a vendor/supplier's unpriced item is what actually
// creates their payable — a store admin may only do this for their own
// store's entities (see pendingEntityService.setPurchasePrice's
// assertStoreAccess check).
router.patch(
  '/:id/price',
  requirePermission(PERMISSIONS.PENDING_ENTITIES_PRICE),
  setPriceValidator,
  validate,
  pendingEntityController.setPrice,
);

module.exports = router;
