const User = require('../models/userModel');
const Role = require('../models/roleModel');
const ApiError = require('../utils/ApiError');
const { ROLES } = require('../utils/constants');

/**
 * Admin-facing user management. Authorization (who may call these) is
 * enforced by route middleware; here we enforce the data rules.
 */

// Verify the target role exists and that the actor is allowed to assign it.
// Only a super admin may grant the super_admin role.
async function assertAssignableRole(actor, roleName) {
  const role = await Role.findOne({ name: roleName });
  if (!role) throw ApiError.badRequest(`Unknown role: ${roleName}`);

  if (role.name === ROLES.SUPER_ADMIN && actor.role !== ROLES.SUPER_ADMIN) {
    throw ApiError.forbidden('Only a super admin can assign the super_admin role');
  }
  return role;
}

async function listUsers({ page = 1, limit = 20, role, search }) {
  const filter = {};
  if (role) filter.role = role;
  if (search) {
    filter.$or = [
      { name: { $regex: search, $options: 'i' } },
      { email: { $regex: search, $options: 'i' } },
    ];
  }

  const skip = (Math.max(page, 1) - 1) * limit;
  const [users, total] = await Promise.all([
    User.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
    User.countDocuments(filter),
  ]);

  return { users, total, page: Number(page), limit: Number(limit) };
}

async function getUserById(id) {
  const user = await User.findById(id);
  if (!user) throw ApiError.notFound('User not found');
  return user;
}

// Admin creates a user with an explicit role (e.g. onboarding staff).
async function createUser(actor, { name, email, password, role }) {
  const roleName = role || ROLES.CASHIER;
  await assertAssignableRole(actor, roleName);

  const existing = await User.findOne({ email });
  if (existing) throw ApiError.conflict('Email is already registered');

  return User.create({ name, email, password, role: roleName });
}

async function updateUserRole(actor, targetId, newRole) {
  const target = await User.findById(targetId);
  if (!target) throw ApiError.notFound('User not found');

  // Demoting/changing an existing super admin is also super-admin-only.
  if (target.role === ROLES.SUPER_ADMIN && actor.role !== ROLES.SUPER_ADMIN) {
    throw ApiError.forbidden('Only a super admin can manage super admins');
  }

  // Validates the role exists and gates assigning super_admin.
  await assertAssignableRole(actor, newRole);

  target.role = newRole;
  await target.save();
  return target;
}

async function setUserActive(actor, targetId, isActive) {
  if (actor._id.toString() === targetId) {
    throw ApiError.badRequest('You cannot change your own active status');
  }
  const target = await User.findById(targetId);
  if (!target) throw ApiError.notFound('User not found');

  if (target.role === ROLES.SUPER_ADMIN && actor.role !== ROLES.SUPER_ADMIN) {
    throw ApiError.forbidden('Only a super admin can manage super admins');
  }

  target.isActive = isActive;
  await target.save();
  return target;
}

// Edit a user's profile (name and/or email). Role and active status have their
// own dedicated endpoints.
async function updateUser(actor, targetId, { name, email }) {
  const target = await User.findById(targetId);
  if (!target) throw ApiError.notFound('User not found');

  if (target.role === ROLES.SUPER_ADMIN && actor.role !== ROLES.SUPER_ADMIN) {
    throw ApiError.forbidden('Only a super admin can manage super admins');
  }

  if (email && email !== target.email) {
    const existing = await User.findOne({ email });
    if (existing) throw ApiError.conflict('Email is already registered');
    target.email = email;
  }
  if (name) target.name = name;

  await target.save();
  return target;
}

async function deleteUser(actor, targetId) {
  if (actor._id.toString() === targetId) {
    throw ApiError.badRequest('You cannot delete your own account');
  }
  const target = await User.findById(targetId);
  if (!target) throw ApiError.notFound('User not found');

  if (target.role === ROLES.SUPER_ADMIN && actor.role !== ROLES.SUPER_ADMIN) {
    throw ApiError.forbidden('Only a super admin can delete super admins');
  }

  await target.deleteOne();
}

module.exports = {
  listUsers,
  getUserById,
  createUser,
  updateUser,
  updateUserRole,
  setUserActive,
  deleteUser,
};
