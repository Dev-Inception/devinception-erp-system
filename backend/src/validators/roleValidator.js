const { body, param } = require("express-validator");
const { PERMISSION_VALUES } = require("../utils/permissions");

const idParam = param("id").isMongoId().withMessage("Invalid role id");

const permissionsRule = (field) =>
  body(field)
    .isArray()
    .withMessage("permissions must be an array")
    .bail()
    .custom((perms) => perms.every((p) => PERMISSION_VALUES.includes(p)))
    .withMessage(`Each permission must be one of: ${PERMISSION_VALUES.join(", ")}`);

const createRoleValidator = [
  body("name")
    .trim()
    .notEmpty()
    .withMessage("Role name is required")
    .matches(/^[a-z0-9_]+$/i)
    .withMessage("Role name may only contain letters, numbers and underscores"),
  body("description").optional().trim().isLength({ max: 200 }),
  permissionsRule("permissions").optional(),
];

const updateRoleValidator = [
  idParam,
  body("description").optional().trim().isLength({ max: 200 }),
  permissionsRule("permissions").optional(),
];

const idParamValidator = [idParam];

module.exports = {
  createRoleValidator,
  updateRoleValidator,
  idParamValidator,
};
