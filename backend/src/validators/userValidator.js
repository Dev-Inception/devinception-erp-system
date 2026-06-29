const { body, param } = require("express-validator");

const idParam = param("id").isMongoId().withMessage("Invalid user id");

// Role names are dynamic (stored in the Role collection), so we only check
// shape here; the service verifies the role actually exists.
const roleRule = (field) =>
  body(field).trim().notEmpty().withMessage("Role is required");

const createUserValidator = [
  body("name").trim().notEmpty().withMessage("Name is required"),
  body("email").isEmail().withMessage("A valid email is required").normalizeEmail(),
  body("password").isLength({ min: 8 }).withMessage("Password must be at least 8 characters"),
  roleRule("role"),
];

const updateRoleValidator = [idParam, roleRule("role")];

const setActiveValidator = [
  idParam,
  body("isActive").isBoolean().withMessage("isActive must be a boolean"),
];

const idParamValidator = [idParam];

module.exports = {
  createUserValidator,
  updateRoleValidator,
  setActiveValidator,
  idParamValidator,
};
