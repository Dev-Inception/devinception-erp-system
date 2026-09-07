const { Op } = require('sequelize');
const { initializeModels } = require('../db/models');
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
  const { Role, User } = initializeModels();
  const role = await Role.findOne({ where: { name: roleName } });
  if (!role) throw ApiError.badRequest(`Unknown role: ${roleName}`);

  if (role.name === ROLES.SUPER_ADMIN) {
    if (actor.role !== ROLES.SUPER_ADMIN) {
      throw ApiError.forbidden('Only a super admin can assign the super_admin role');
    }
    const where = { role: ROLES.SUPER_ADMIN };
    if (excludeUserId) where.id = { [Op.ne]: excludeUserId };
    const exists = await User.findOne({ where, attributes: ['id'] });
    if (exists) {
      throw ApiError.badRequest('A super admin already exists — only one is allowed');
    }
  }
  return role;
}

async function listUsers({ page = 1, limit = 20, role, search }) {
  const { User } = initializeModels();
  const where = {};
  if (role) where.role = role;
  if (search) {
    where[Op.or] = [
      { name: { [Op.iLike]: `%${search}%` } },
      { email: { [Op.iLike]: `%${search}%` } },
    ];
  }

  const pageNum = Math.max(Number(page) || 1, 1);
  const limitNum = Number(limit) || 20;
  const offset = (pageNum - 1) * limitNum;

  const { rows: users, count: total } = await User.findAndCountAll({
    where,
    include: [{ association: 'storeInfo', attributes: ['id', 'name', 'code'] }],
    order: [['createdAt', 'DESC']],
    offset,
    limit: limitNum,
  });

  return { users, total, page: Number(page), limit: Number(limit) };
}

async function getUserById(id) {
  const { User } = initializeModels();
  const user = await User.findByPk(id, {
    include: [{ association: 'storeInfo', attributes: ['id', 'name', 'code'] }],
  });
  if (!user) throw ApiError.notFound('User not found');
  return user;
}

// Admin creates a user with an explicit role (e.g. onboarding staff). Every
// role except super_admin is confined to one storefront: they never see or
// act on another store's data (see utils/storeScope.js), so the store they
// belong to has to be decided at creation time.
async function createUser(actor, { name, email, password, role, store }) {
  const { User, Store } = initializeModels();
  const roleName = role || ROLES.CASHIER;
  await assertAssignableRole(actor, roleName);

  const existing = await User.findOne({ where: { email } });
  if (existing) throw ApiError.conflict('Email is already registered');

  let storeId = null;
  if (roleName !== ROLES.SUPER_ADMIN) {
    if (!store) throw ApiError.badRequest('A store is required for this role');
    const storeDoc = await Store.findByPk(store);
    if (!storeDoc) throw ApiError.badRequest('Store not found');
    storeId = storeDoc.id;
  }

  return User.create({ name, email, password, role: roleName, store: storeId });
}

async function updateUserRole(actor, targetId, newRole) {
  // A super admin can lock themselves out of the only account that can
  // manage users/permissions by changing their own role — nobody else could
  // then undo it through the app. Block it outright, same as they can
  // already never deactivate or delete themselves below.
  if (actor.role === ROLES.SUPER_ADMIN && String(actor.id) === String(targetId)) {
    throw ApiError.badRequest('A super admin cannot change their own role');
  }

  const { User } = initializeModels();
  const target = await User.findByPk(targetId);
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
  if (String(actor.id) === String(targetId)) {
    throw ApiError.badRequest('You cannot change your own active status');
  }
  const { User } = initializeModels();
  const target = await User.findByPk(targetId);
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
  const { User } = initializeModels();
  const target = await User.findByPk(targetId);
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
  const { User } = initializeModels();
  const target = await User.findByPk(targetId);
  if (!target) throw ApiError.notFound('User not found');

  if (target.role === ROLES.SUPER_ADMIN && actor.role !== ROLES.SUPER_ADMIN) {
    throw ApiError.forbidden('Only a super admin can manage super admins');
  }

  if (email && email !== target.email) {
    const existing = await User.findOne({ where: { email } });
    if (existing) throw ApiError.conflict('Email is already registered');
    target.email = email;
  }
  if (name) target.name = name;

  await target.save();
  return target;
}

async function deleteUser(actor, targetId) {
  if (String(actor.id) === String(targetId)) {
    throw ApiError.badRequest('You cannot delete your own account');
  }
  const { User } = initializeModels();
  const target = await User.findByPk(targetId);
  if (!target) throw ApiError.notFound('User not found');

  if (target.role === ROLES.SUPER_ADMIN && actor.role !== ROLES.SUPER_ADMIN) {
    throw ApiError.forbidden('Only a super admin can delete super admins');
  }

  await target.destroy();
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
