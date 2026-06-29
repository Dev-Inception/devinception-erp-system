const roleService = require("../services/roleService");
const asyncHandler = require("../utils/asyncHandler");
const { sendSuccess } = require("../utils/ApiResponse");
const { PERMISSION_VALUES } = require("../utils/permissions");

const listRoles = asyncHandler(async (_req, res) => {
  const roles = await roleService.listRoles();
  return sendSuccess(res, 200, "Roles fetched", { roles });
});

// Expose the permission catalog so clients can build a role editor UI.
const listPermissions = asyncHandler(async (_req, res) => {
  return sendSuccess(res, 200, "Permissions fetched", {
    permissions: PERMISSION_VALUES,
  });
});

const getRole = asyncHandler(async (req, res) => {
  const role = await roleService.getRoleById(req.params.id);
  return sendSuccess(res, 200, "Role fetched", { role });
});

const createRole = asyncHandler(async (req, res) => {
  const { name, description, permissions } = req.body;
  const role = await roleService.createRole({ name, description, permissions });
  return sendSuccess(res, 201, "Role created", { role });
});

const updateRole = asyncHandler(async (req, res) => {
  const { description, permissions } = req.body;
  const role = await roleService.updateRole(req.params.id, {
    description,
    permissions,
  });
  return sendSuccess(res, 200, "Role updated", { role });
});

const deleteRole = asyncHandler(async (req, res) => {
  await roleService.deleteRole(req.params.id);
  return sendSuccess(res, 200, "Role deleted");
});

module.exports = {
  listRoles,
  listPermissions,
  getRole,
  createRole,
  updateRole,
  deleteRole,
};
