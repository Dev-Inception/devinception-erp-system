const userService = require("../services/userService");
const asyncHandler = require("../utils/asyncHandler");
const { sendSuccess } = require("../utils/ApiResponse");

const listUsers = asyncHandler(async (req, res) => {
  const { page, limit, role, search } = req.query;
  const result = await userService.listUsers({ page, limit, role, search });
  return sendSuccess(res, 200, "Users fetched", result);
});

const getUser = asyncHandler(async (req, res) => {
  const user = await userService.getUserById(req.params.id);
  return sendSuccess(res, 200, "User fetched", { user });
});

const createUser = asyncHandler(async (req, res) => {
  const { name, email, password, role } = req.body;
  const user = await userService.createUser(req.user, {
    name,
    email,
    password,
    role,
  });
  return sendSuccess(res, 201, "User created", { user });
});

const updateUserRole = asyncHandler(async (req, res) => {
  const user = await userService.updateUserRole(
    req.user,
    req.params.id,
    req.body.role
  );
  return sendSuccess(res, 200, "User role updated", { user });
});

const setUserActive = asyncHandler(async (req, res) => {
  const user = await userService.setUserActive(
    req.user,
    req.params.id,
    req.body.isActive
  );
  return sendSuccess(res, 200, "User status updated", { user });
});

const deleteUser = asyncHandler(async (req, res) => {
  await userService.deleteUser(req.user, req.params.id);
  return sendSuccess(res, 200, "User deleted");
});

module.exports = {
  listUsers,
  getUser,
  createUser,
  updateUserRole,
  setUserActive,
  deleteUser,
};
