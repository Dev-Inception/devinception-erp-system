const express = require("express");
const invoiceController = require("../controllers/invoiceController");
const { protect } = require("../middlewares/authMiddleware");
const { requirePermission } = require("../middlewares/roleMiddleware");
const { validate } = require("../middlewares/validateMiddleware");
const { PERMISSIONS } = require("../utils/permissions");
const {
  createInvoiceValidator,
  payInvoiceValidator,
  idParamValidator,
} = require("../validators/invoiceValidator");

const router = express.Router();
router.use(protect);

router.get("/", requirePermission(PERMISSIONS.INVOICES_READ), invoiceController.listInvoices);
router.get(
  "/:id",
  requirePermission(PERMISSIONS.INVOICES_READ),
  idParamValidator,
  validate,
  invoiceController.getInvoice
);
router.post(
  "/",
  requirePermission(PERMISSIONS.INVOICES_CREATE),
  createInvoiceValidator,
  validate,
  invoiceController.createInvoice
);
router.get(
  "/:id/pdf",
  requirePermission(PERMISSIONS.INVOICES_READ),
  idParamValidator,
  validate,
  invoiceController.downloadInvoicePdf
);
router.post(
  "/:id/pay",
  requirePermission(PERMISSIONS.INVOICES_CREATE),
  payInvoiceValidator,
  validate,
  invoiceController.payInvoice
);

module.exports = router;
