const User = require('../models/userModel');
const Role = require('../models/roleModel');
const Store = require('../models/storeModel');
const ApiError = require('../utils/ApiError');
const { ROLES } = require('../utils/constants');

/**
 * Admin-facing user management. Authorization (who may call these) is
 * enforced by route middleware; here we enforce the data rules.
 */

// Verify the target role exists and that the actor is allowed to assign it.
// Only a super admin may grant the super_admin role, and the system only
// ever has one — `excludeUserId` excludes the target themselves from that
// existing-super-admin check (relevant if they're ever re-saved via a path
// other than updateUserRole, which now blocks a super admin from targeting
// themselves at all — see the guard there).
async function assertAssignableRole(actor, roleName, excludeUserId = null) {
  const role = await Role.findOne({ name: roleName });
  if (!role) throw ApiError.badRequest(`Unknown role: ${roleName}`);

  if (role.name === ROLES.SUPER_ADMIN) {
    if (actor.role !== ROLES.SUPER_ADMIN) {
      throw ApiError.forbidden('Only a super admin can assign the super_admin role');
    }
    const filter = { role: ROLES.SUPER_ADMIN };
    if (excludeUserId) filter._id = { $ne: excludeUserId };
    if (await User.exists(filter)) {
      throw ApiError.badRequest('A super admin already exists — only one is allowed');
    }
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
    User.find(filter)
      .populate('store', 'name code')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit),
    User.countDocuments(filter),
  ]);

  return { users, total, page: Number(page), limit: Number(limit) };
}

async function getUserById(id) {
  const user = await User.findById(id).populate('store', 'name code');
  if (!user) throw ApiError.notFound('User not found');
  return user;
}

// Admin creates a user with an explicit role (e.g. onboarding staff). Every
// role except super_admin is confined to one storefront: they never see or
// act on another store's data (see utils/storeScope.js), so the store they
// belong to has to be decided at creation time.
async function createUser(actor, { name, email, password, role, store }) {
  const roleName = role || ROLES.CASHIER;
  await assertAssignableRole(actor, roleName);

  const existing = await User.findOne({ email });
  if (existing) throw ApiError.conflict('Email is already registered');

  let storeId = null;
  if (roleName !== ROLES.SUPER_ADMIN) {
    if (!store) throw ApiError.badRequest('A store is required for this role');
    const storeDoc = await Store.findById(store);
    if (!storeDoc) throw ApiError.badRequest('Store not found');
    storeId = storeDoc._id;
  }

  return User.create({ name, email, password, role: roleName, store: storeId });
}

async function updateUserRole(actor, targetId, newRole) {
  // A super admin can lock themselves out of the only account that can
  // manage users/permissions by changing their own role — nobody else could
  // then undo it through the app. Block it outright, same as they can
  // already never deactivate or delete themselves below.
  if (actor.role === ROLES.SUPER_ADMIN && actor._id.toString() === String(targetId)) {
    throw ApiError.badRequest('A super admin cannot change their own role');
  }

  const target = await User.findById(targetId);
  if (!target) throw ApiError.notFound('User not found');

  // Demoting/changing an existing super admin is also super-admin-only.
  if (target.role === ROLES.SUPER_ADMIN && actor.role !== ROLES.SUPER_ADMIN) {
    throw ApiError.forbidden('Only a super admin can manage super admins');
  }

  // Validates the role exists and gates assigning super_admin.
  await assertAssignableRole(actor, newRole, targetId);

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

// Force-set a user's password (admin/super-admin action — no current
// password required, unlike the self-service authService.changePassword).
// Re-saving triggers the model's pre-save hash + bumps passwordChangedAt,
// which invalidates that user's existing JWTs the same way a self-service
// change does.
async function setUserPassword(actor, targetId, newPassword) {
  const target = await User.findById(targetId);
  if (!target) throw ApiError.notFound('User not found');

  if (target.role === ROLES.SUPER_ADMIN && actor.role !== ROLES.SUPER_ADMIN) {
    throw ApiError.forbidden('Only a super admin can manage super admins');
  }

  target.password = newPassword;
  await target.save();
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
  setUserPassword,
  deleteUser,
};
