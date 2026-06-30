const Role = require('../models/roleModel');
const User = require('../models/userModel');
const ApiError = require('../utils/ApiError');
const { ROLES } = require('../utils/constants');
const { PERMISSIONS, PERMISSION_VALUES, WILDCARD } = require('../utils/permissions');

/**
 * Role management + a small in-process permission cache so authorization
 * checks don't hit the DB on every request. The cache is invalidated
 * whenever a role is mutated; in a multi-process deployment each process
 * simply rebuilds its own cache on the next request.
 */

// The five built-in roles. Permissions here preserve the original
// hard-coded authorization: managers can read users, admins manage them,
// super_admin can do everything (including role management) via wildcard.
const SYSTEM_ROLES = [
  {
    name: ROLES.CASHIER,
    description: 'Point-of-sale operator',
    // The POS needs to look up/add walk-in customers, read stock, and ring sales.
    permissions: [
      PERMISSIONS.CUSTOMERS_READ,
      PERMISSIONS.CUSTOMERS_CREATE,
      PERMISSIONS.INVENTORY_READ,
      PERMISSIONS.SALES_READ,
      PERMISSIONS.SALES_CREATE,
    ],
  },
  {
    name: ROLES.ACCOUNTANT,
    description: 'Finance / reporting',
    // Read-only over partners, plus full finance, ledger and report access.
    permissions: [
      PERMISSIONS.VENDORS_READ,
      PERMISSIONS.CUSTOMERS_READ,
      PERMISSIONS.INVENTORY_READ,
      PERMISSIONS.PURCHASES_READ,
      PERMISSIONS.SALES_READ,
      PERMISSIONS.INVOICES_READ,
      PERMISSIONS.FINANCE_READ,
      PERMISSIONS.FINANCE_MANAGE,
      PERMISSIONS.REPORTS_READ,
    ],
  },
  {
    name: ROLES.MANAGER,
    description: 'Can view staff and run day-to-day operations',
    permissions: [
      PERMISSIONS.USERS_READ,
      PERMISSIONS.VENDORS_READ,
      PERMISSIONS.VENDORS_CREATE,
      PERMISSIONS.VENDORS_UPDATE,
      PERMISSIONS.CUSTOMERS_READ,
      PERMISSIONS.CUSTOMERS_CREATE,
      PERMISSIONS.CUSTOMERS_UPDATE,
      PERMISSIONS.INVENTORY_READ,
      PERMISSIONS.INVENTORY_MANAGE,
      PERMISSIONS.PURCHASES_READ,
      PERMISSIONS.PURCHASES_CREATE,
      PERMISSIONS.SALES_READ,
      PERMISSIONS.SALES_CREATE,
      PERMISSIONS.INVOICES_READ,
      PERMISSIONS.INVOICES_CREATE,
      PERMISSIONS.FINANCE_READ,
      PERMISSIONS.REPORTS_READ,
    ],
  },
  {
    name: ROLES.ADMIN,
    description: 'Manages staff accounts, operations and finance',
    permissions: [
      PERMISSIONS.USERS_READ,
      PERMISSIONS.USERS_CREATE,
      PERMISSIONS.USERS_UPDATE_ROLE,
      PERMISSIONS.USERS_SET_ACTIVE,
      PERMISSIONS.USERS_DELETE,
      PERMISSIONS.VENDORS_READ,
      PERMISSIONS.VENDORS_CREATE,
      PERMISSIONS.VENDORS_UPDATE,
      PERMISSIONS.VENDORS_DELETE,
      PERMISSIONS.CUSTOMERS_READ,
      PERMISSIONS.CUSTOMERS_CREATE,
      PERMISSIONS.CUSTOMERS_UPDATE,
      PERMISSIONS.CUSTOMERS_DELETE,
      PERMISSIONS.INVENTORY_READ,
      PERMISSIONS.INVENTORY_MANAGE,
      PERMISSIONS.PURCHASES_READ,
      PERMISSIONS.PURCHASES_CREATE,
      PERMISSIONS.SALES_READ,
      PERMISSIONS.SALES_CREATE,
      PERMISSIONS.INVOICES_READ,
      PERMISSIONS.INVOICES_CREATE,
      PERMISSIONS.FINANCE_READ,
      PERMISSIONS.FINANCE_MANAGE,
      PERMISSIONS.REPORTS_READ,
      PERMISSIONS.SETTINGS_READ,
      PERMISSIONS.SETTINGS_MANAGE,
    ],
  },
  {
    name: ROLES.SUPER_ADMIN,
    description: 'Full access, including role management',
    permissions: [WILDCARD],
  },
];

let cache = null; // Map<roleName, Set<permission>>

async function getCache() {
  if (cache) return cache;
  const roles = await Role.find().lean();
  cache = new Map(roles.map((r) => [r.name, new Set(r.permissions)]));
  return cache;
}

function invalidateCache() {
  cache = null;
}

// Resolve the permission set for a role name (empty set if unknown).
async function getPermissions(roleName) {
  const c = await getCache();
  return c.get(roleName) || new Set();
}

// Idempotently create any missing built-in roles. Existing system roles are
// left untouched so a super admin's permission tweaks survive re-seeding.
async function ensureSystemRoles() {
  for (const def of SYSTEM_ROLES) {
    await Role.updateOne(
      { name: def.name },
      { $setOnInsert: { ...def, isSystem: true } },
      { upsert: true },
    );
  }
  invalidateCache();
}

function validatePermissions(permissions) {
  if (permissions.includes(WILDCARD)) {
    throw ApiError.badRequest('The wildcard permission cannot be assigned to a custom role');
  }
  const unknown = permissions.filter((p) => !PERMISSION_VALUES.includes(p));
  if (unknown.length) {
    throw ApiError.badRequest(`Unknown permission(s): ${unknown.join(', ')}`);
  }
}

async function listRoles() {
  return Role.find().sort({ createdAt: 1 });
}

async function getRoleById(id) {
  const role = await Role.findById(id);
  if (!role) throw ApiError.notFound('Role not found');
  return role;
}

async function createRole({ name, description, permissions = [] }) {
  const normalized = name.trim().toLowerCase();
  const existing = await Role.findOne({ name: normalized });
  if (existing) throw ApiError.conflict('A role with that name already exists');

  validatePermissions(permissions);

  const role = await Role.create({
    name: normalized,
    description,
    permissions,
    isSystem: false,
  });
  invalidateCache();
  return role;
}

// Only description and permissions are editable. `name` is immutable (it is
// referenced by User.role), and the super_admin role is fully locked.
async function updateRole(id, { description, permissions }) {
  const role = await getRoleById(id);

  if (role.name === ROLES.SUPER_ADMIN) {
    throw ApiError.forbidden('The super_admin role cannot be modified');
  }

  if (permissions !== undefined) {
    validatePermissions(permissions);
    role.permissions = permissions;
  }
  if (description !== undefined) {
    role.description = description;
  }

  await role.save();
  invalidateCache();
  return role;
}

async function deleteRole(id) {
  const role = await getRoleById(id);

  if (role.isSystem) {
    throw ApiError.forbidden('Built-in roles cannot be deleted');
  }

  const inUse = await User.countDocuments({ role: role.name });
  if (inUse) {
    throw ApiError.badRequest(
      `Role is assigned to ${inUse} user(s); reassign them before deleting`,
    );
  }

  await role.deleteOne();
  invalidateCache();
}

module.exports = {
  SYSTEM_ROLES,
  ensureSystemRoles,
  getPermissions,
  invalidateCache,
  listRoles,
  getRoleById,
  createRole,
  updateRole,
  deleteRole,
};
