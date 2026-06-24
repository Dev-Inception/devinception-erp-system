const { body, param } = require("express-validator");
const { PAYMENT_METHODS } = require("../utils/finance");

const idParam = param("id").isMongoId().withMessage("Invalid id");

/* Bank accounts */
const createBankAccountValidator = [
  body("name").trim().notEmpty().withMessage("Name is required").isLength({ max: 120 }),
  body("bankName").optional({ values: "falsy" }).trim().isLength({ max: 120 }),
  body("accountNumber").optional({ values: "falsy" }).trim().isLength({ max: 60 }),
  body("openingBalance").optional({ values: "falsy" }).isFloat({ min: 0 }).withMessage("Opening balance must be non-negative"),
];

const updateBankAccountValidator = [
  idParam,
  body("name").optional().trim().notEmpty().withMessage("Name cannot be empty").isLength({ max: 120 }),
  body("bankName").optional({ values: "falsy" }).trim().isLength({ max: 120 }),
  body("accountNumber").optional({ values: "falsy" }).trim().isLength({ max: 60 }),
  body("isActive").optional().isBoolean(),
];

/* Payments */
const payVendorValidator = [
  body("vendor").isMongoId().withMessage("A valid vendor is required"),
  body("amount").isFloat({ gt: 0 }).withMessage("Amount must be positive"),
  body("method").optional({ values: "falsy" }).isIn(PAYMENT_METHODS).withMessage("Invalid payment method"),
  body("bankAccount").optional({ values: "falsy" }).isMongoId().withMessage("Invalid bank account"),
  body("date").optional({ values: "falsy" }).isISO8601().withMessage("Invalid date"),
  body("note").optional({ values: "falsy" }).trim().isLength({ max: 200 }),
];

const receiveCustomerValidator = [
  body("customer").isMongoId().withMessage("A valid customer is required"),
  body("amount").isFloat({ gt: 0 }).withMessage("Amount must be positive"),
  body("method").optional({ values: "falsy" }).isIn(PAYMENT_METHODS).withMessage("Invalid payment method"),
  body("bankAccount").optional({ values: "falsy" }).isMongoId().withMessage("Invalid bank account"),
  body("date").optional({ values: "falsy" }).isISO8601().withMessage("Invalid date"),
  body("note").optional({ values: "falsy" }).trim().isLength({ max: 200 }),
];

const cashEntryValidator = [
  body("direction").isIn(["IN", "OUT"]).withMessage("Direction must be IN or OUT"),
  body("amount").isFloat({ gt: 0 }).withMessage("Amount must be positive"),
  body("date").optional({ values: "falsy" }).isISO8601().withMessage("Invalid date"),
  body("note").optional({ values: "falsy" }).trim().isLength({ max: 200 }),
];

/* Ledger statement params */
const statementParamValidator = [
  param("kind").isIn(["customer", "vendor"]).withMessage("kind must be 'customer' or 'vendor'"),
  param("id").isMongoId().withMessage("Invalid party id"),
];

const idParamValidator = [idParam];

module.exports = {
  createBankAccountValidator,
  updateBankAccountValidator,
  payVendorValidator,
  receiveCustomerValidator,
  cashEntryValidator,
  statementParamValidator,
  idParamValidator,
};
