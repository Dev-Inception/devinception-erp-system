const { body, param } = require("express-validator");

const idParam = param("id").isMongoId().withMessage("Invalid product id");

const optionalFields = [
  body("barcode").optional({ values: "falsy" }).trim().isLength({ max: 60 }),
  body("category").optional({ values: "falsy" }).trim().isLength({ max: 80 }),
  body("unit").optional({ values: "falsy" }).trim().isLength({ max: 20 }),
  body("purchasePrice").optional({ values: "falsy" }).isFloat({ min: 0 }).withMessage("Purchase price must be non-negative"),
  body("salePrice").optional({ values: "falsy" }).isFloat({ min: 0 }).withMessage("Sale price must be non-negative"),
  body("taxPercent").optional({ values: "falsy" }).isFloat({ min: 0, max: 100 }).withMessage("Tax % must be 0–100"),
  body("minStock").optional({ values: "falsy" }).isFloat({ min: 0 }).withMessage("Min stock must be non-negative"),
];

const createProductValidator = [
  body("name").trim().notEmpty().withMessage("Name is required").isLength({ max: 160 }),
  body("sku").trim().notEmpty().withMessage("SKU is required").isLength({ max: 60 }),
  ...optionalFields,
];

const updateProductValidator = [
  idParam,
  body("name").optional().trim().notEmpty().withMessage("Name cannot be empty").isLength({ max: 160 }),
  body("sku").optional().trim().notEmpty().withMessage("SKU cannot be empty").isLength({ max: 60 }),
  body("isActive").optional().isBoolean(),
  ...optionalFields,
];

const adjustStockValidator = [
  idParam,
  body("warehouse").isMongoId().withMessage("A valid warehouse is required"),
  body("delta")
    .isFloat()
    .withMessage("delta must be a number")
    .custom((v) => Number(v) !== 0)
    .withMessage("delta cannot be zero"),
  body("unitCost").optional({ values: "falsy" }).isFloat({ min: 0 }).withMessage("unitCost must be non-negative"),
  body("note").optional({ values: "falsy" }).trim().isLength({ max: 200 }),
];

const idParamValidator = [idParam];

module.exports = {
  createProductValidator,
  updateProductValidator,
  adjustStockValidator,
  idParamValidator,
};
