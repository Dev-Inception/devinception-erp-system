const { body, param } = require("express-validator");
const { PAYMENT_METHODS } = require("../utils/finance");

const idParam = param("id").isMongoId().withMessage("Invalid purchase id");

const createPurchaseValidator = [
  body("vendor").isMongoId().withMessage("A valid vendor is required"),
  body("warehouse").optional({ values: "falsy" }).isMongoId().withMessage("Invalid warehouse"),
  body("date").optional({ values: "falsy" }).isISO8601().withMessage("Invalid date"),
  body("items").isArray({ min: 1 }).withMessage("At least one item is required"),
  body("items.*.product").isMongoId().withMessage("Each item needs a valid product"),
  body("items.*.quantity").isFloat({ gt: 0 }).withMessage("Each item quantity must be positive"),
  body("items.*.unitCost").isFloat({ min: 0 }).withMessage("Each item unit cost must be non-negative"),
  body("items.*.taxPercent").optional({ values: "falsy" }).isFloat({ min: 0, max: 100 }).withMessage("Item tax % must be 0–100"),
  body("vendorInvoiceNo").optional({ values: "falsy" }).trim().isLength({ max: 60 }),
  body("discount").optional({ values: "falsy" }).isFloat({ min: 0 }).withMessage("Discount must be non-negative"),
  body("paid").optional({ values: "falsy" }).isFloat({ min: 0 }).withMessage("Paid must be non-negative"),
  body("paymentMethod").optional({ values: "falsy" }).isIn(PAYMENT_METHODS).withMessage("Invalid payment method"),
  body("bankAccount").optional({ values: "falsy" }).isMongoId().withMessage("Invalid bank account"),
  body("notes").optional({ values: "falsy" }).trim().isLength({ max: 300 }),
];

const idParamValidator = [idParam];

module.exports = { createPurchaseValidator, idParamValidator };
