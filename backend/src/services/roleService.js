const { Op } = require('sequelize');
const { initializeModels } = require('../db/models');
const ApiError = require('../utils/ApiError');
const { ROLES } = require('../utils/constants');
const { PERMISSIONS, PERMISSION_VALUES, WILDCARD } = require('../utils/permissions');
const {
  resolveStoreScope,
  resolveOptionalWriteStore,
  assertStoreAccess,
} = require('../utils/storeScope');

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
    // The POS needs to look up/add customers, read stock, ring sales, and
    // record advance payments taken against an on-account sale at checkout.
    permissions: [
      PERMISSIONS.CUSTOMERS_READ,
      PERMISSIONS.CUSTOMERS_CREATE,
      PERMISSIONS.INVENTORY_READ,
      PERMISSIONS.GATE_PASSES_READ,
      PERMISSIONS.DAMAGED_STOCK_READ,
      PERMISSIONS.SALES_READ,
      PERMISSIONS.SALES_CREATE,
      PERMISSIONS.ESTIMATES_READ,
      PERMISSIONS.ESTIMATES_CREATE,
      PERMISSIONS.FINANCE_MANAGE,
      PERMISSIONS.EXPENSES_MANAGE,
      PERMISSIONS.LABOUR_READ,
    ],
  },
  {
    name: ROLES.ACCOUNTANT,
    description: 'Finance / reporting',
    // Read-only over partners, plus full finance, ledger and report access.
    permissions: [
      PERMISSIONS.VENDORS_READ,
      PERMISSIONS.SUPPLIERS_READ,
      PERMISSIONS.TRANSPORTERS_READ,
      PERMISSIONS.LABOUR_READ,
      PERMISSIONS.CUSTOMERS_READ,
      PERMISSIONS.INVENTORY_READ,
      PERMISSIONS.GATE_PASSES_READ,
      PERMISSIONS.DAMAGED_STOCK_READ,
      PERMISSIONS.SALES_READ,
      PERMISSIONS.ESTIMATES_READ,
      PERMISSIONS.FINANCE_READ,
      PERMISSIONS.FINANCE_MANAGE,
      PERMISSIONS.EXPENSES_MANAGE,
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
      PERMISSIONS.SUPPLIERS_READ,
      PERMISSIONS.SUPPLIERS_CREATE,
      PERMISSIONS.SUPPLIERS_UPDATE,
      PERMISSIONS.TRANSPORTERS_READ,
      PERMISSIONS.TRANSPORTERS_CREATE,
      PERMISSIONS.TRANSPORTERS_UPDATE,
      PERMISSIONS.LABOUR_READ,
      PERMISSIONS.LABOUR_CREATE,
      PERMISSIONS.LABOUR_UPDATE,
      PERMISSIONS.CUSTOMERS_READ,
      PERMISSIONS.CUSTOMERS_CREATE,
      PERMISSIONS.CUSTOMERS_UPDATE,
      PERMISSIONS.INVENTORY_READ,
      PERMISSIONS.INVENTORY_MANAGE,
      PERMISSIONS.GATE_PASSES_READ,
      PERMISSIONS.DAMAGED_STOCK_READ,
      PERMISSIONS.DAMAGED_STOCK_MANAGE,
      PERMISSIONS.SALES_READ,
      PERMISSIONS.SALES_CREATE,
      PERMISSIONS.SALES_UPDATE,
      PERMISSIONS.ESTIMATES_READ,
      PERMISSIONS.ESTIMATES_CREATE,
      PERMISSIONS.ESTIMATES_UPDATE,
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
      PERMISSIONS.USERS_UPDATE,
      PERMISSIONS.USERS_UPDATE_ROLE,
      PERMISSIONS.USERS_SET_ACTIVE,
      PERMISSIONS.USERS_SET_PASSWORD,
      PERMISSIONS.USERS_DELETE,
      PERMISSIONS.VENDORS_READ,
      PERMISSIONS.VENDORS_CREATE,
      PERMISSIONS.VENDORS_UPDATE,
      PERMISSIONS.VENDORS_DELETE,
      PERMISSIONS.SUPPLIERS_READ,
      PERMISSIONS.SUPPLIERS_CREATE,
      PERMISSIONS.SUPPLIERS_UPDATE,
      PERMISSIONS.SUPPLIERS_DELETE,
      PERMISSIONS.TRANSPORTERS_READ,
      PERMISSIONS.TRANSPORTERS_CREATE,
      PERMISSIONS.TRANSPORTERS_UPDATE,
      PERMISSIONS.TRANSPORTERS_DELETE,
      PERMISSIONS.LABOUR_READ,
      PERMISSIONS.LABOUR_CREATE,
      PERMISSIONS.LABOUR_UPDATE,
      PERMISSIONS.LABOUR_DELETE,
      PERMISSIONS.CUSTOMERS_READ,
      PERMISSIONS.CUSTOMERS_CREATE,
      PERMISSIONS.CUSTOMERS_UPDATE,
      PERMISSIONS.CUSTOMERS_DELETE,
      PERMISSIONS.INVENTORY_READ,
      PERMISSIONS.INVENTORY_MANAGE,
      PERMISSIONS.GATE_PASSES_READ,
      PERMISSIONS.DAMAGED_STOCK_READ,
      PERMISSIONS.DAMAGED_STOCK_MANAGE,
      PERMISSIONS.SALES_READ,
      PERMISSIONS.SALES_CREATE,
      PERMISSIONS.SALES_UPDATE,
      PERMISSIONS.ESTIMATES_READ,
      PERMISSIONS.ESTIMATES_CREATE,
      PERMISSIONS.ESTIMATES_UPDATE,
      PERMISSIONS.ESTIMATES_DELETE,
      PERMISSIONS.FINANCE_READ,
      PERMISSIONS.FINANCE_MANAGE,
      PERMISSIONS.EXPENSES_MANAGE,
      PERMISSIONS.EXPENSES_APPROVE,
      PERMISSIONS.PENDING_ENTITIES_PRICE,
      PERMISSIONS.REPORTS_READ,
      PERMISSIONS.SETTINGS_READ,
      PERMISSIONS.SETTINGS_MANAGE,
      // A store admin manages their own custom roles (visibility-scoped —
      // see roleService.js's store-aware list/get/update/delete below), the
      // same way they already manage their own staff.
      PERMISSIONS.ROLES_READ,
      PERMISSIONS.ROLES_CREATE,
      PERMISSIONS.ROLES_UPDATE,
      PERMISSIONS.ROLES_DELETE,
      // Lets an admin edit their own store's name/address/warehouses — the
      // route itself still keeps *creating*/*deleting* a store super-admin-
      // only (buying/canceling a store is a subscription action), and
      // storeService.updateStore only ever lets them touch their own.
      PERMISSIONS.STORES_MANAGE,
    ],
  },
  {
    name: ROLES.SUPER_ADMIN,
    description: 'Full access, including role management',
    permissions: [WILDCARD],
  },
];

let cache = null; // Map<roleName, { permissions: Set<permission>, label: string }>

async function getCache() {
  if (cache) return cache;
  const { Role } = initializeModels();
  const roles = await Role.findAll({ attributes: ['name', 'label', 'permissions'] });
  cache = new Map(
    roles.map((r) => [r.name, { permissions: new Set(r.permissions), label: r.label }]),
  );
  return cache;
}

function invalidateCache() {
  cache = null;
}

// Resolve the permission set for a role name (empty set if unknown).
async function getPermissions(roleName) {
  const c = await getCache();
  return c.get(roleName)?.permissions || new Set();
}

// Resolve a role name to its human-typed display label (e.g. a custom
// role's namespaced technical name `<storeId>__<slug>` back to whatever the
// admin actually typed, like "Manager") — used so the UI never has to show
// the raw technical key. Falls back to the name itself for an unknown role.
async function getRoleLabel(roleName) {
  const c = await getCache();
  return c.get(roleName)?.label || roleName;
}

// Idempotently create any missing built-in roles. Existing system roles are
// left untouched so a super admin's permission tweaks survive re-seeding.
async function ensureSystemRoles() {
  const { Role } = initializeModels();
  for (const def of SYSTEM_ROLES) {
    // findOrCreate only applies `defaults` when it has to insert, mirroring
    // the original upsert's $setOnInsert — an existing row is left alone.
    await Role.findOrCreate({
      where: { name: def.name },
      defaults: { ...def, isSystem: true, label: def.name },
    });
  }
  invalidateCache();
}

// `<storeId>__<slug>` — a technical key that's globally unique by
// construction (a store id is already unique), so two different stores can
// each create a role literally called "Cashier" without colliding on the
// single `roles.name` column `users.role` foreign-keys to.
function slugify(text) {
  return (
    text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-+|-+$)/g, '')
      .slice(0, 70) || 'role'
  );
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

// Every built-in role, plus whichever custom roles belong to the actor's
// own store(s) — a store admin never sees another tenant's custom roles.
// Unrestricted (super admin) with no explicit `store` sees everything; an
// explicit `store` (e.g. super admin viewing "as" one store from the header
// switcher) narrows the same way it would for that store's own admin.
async function listRoles(actor, store) {
  const { Role } = initializeModels();
  const { storeIds } = await resolveStoreScope({ store, actor });
  const where = storeIds
    ? { [Op.or]: [{ isSystem: true }, { store: storeIds.length ? { [Op.in]: storeIds } : null }] }
    : {};
  return Role.findAll({ where, order: [['createdAt', 'ASC']] });
}

// A built-in role is visible to anyone with read access (it's the shared
// baseline every tenant's staff can be assigned); a custom role is only
// visible to the store it belongs to.
async function getRoleById(actor, id) {
  const { Role } = initializeModels();
  const role = await Role.findByPk(id);
  if (!role) throw ApiError.notFound('Role not found');
  if (!role.isSystem) assertStoreAccess(actor, role.store);
  return role;
}

async function createRole(actor, { name, description, permissions = [], store }) {
  const { Role } = initializeModels();
  const label = name.trim();
  if (!label) throw ApiError.badRequest('A name is required');

  validatePermissions(permissions);
  const storeId = resolveOptionalWriteStore(actor, store);

  // A store-owned role's technical name is namespaced by its own store id
  // (see slugify above) so it can never collide with another tenant's role
  // of the same display name; a super-admin-authored global role (no store)
  // keeps the old plain-name behavior, unique platform-wide.
  const technicalName = storeId ? `${storeId}__${slugify(label)}` : label.toLowerCase();
  const existing = await Role.findOne({ where: { name: technicalName } });
  if (existing) {
    throw ApiError.conflict(
      storeId ? 'You already have a role with this name' : 'A role with that name already exists',
    );
  }

  const role = await Role.create({
    name: technicalName,
    label,
    description,
    permissions,
    isSystem: false,
    store: storeId,
  });
  invalidateCache();
  return role;
}

// Only description and permissions are editable. `name` is immutable (it is
// referenced by User.role). The super_admin role is fully locked; any other
// built-in role can only be tuned by a super admin (it's shared by every
// tenant using it) — a store admin may only edit their own custom roles,
// already ownership-checked by getRoleById.
async function updateRole(actor, id, { description, permissions }) {
  const role = await getRoleById(actor, id);

  if (role.name === ROLES.SUPER_ADMIN) {
    throw ApiError.forbidden('The super_admin role cannot be modified');
  }
  if (role.isSystem && actor.role !== ROLES.SUPER_ADMIN) {
    throw ApiError.forbidden('Only a super admin can modify a built-in role');
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

async function deleteRole(actor, id) {
  const { User } = initializeModels();
  const role = await getRoleById(actor, id);

  if (role.isSystem) {
    throw ApiError.forbidden('Built-in roles cannot be deleted');
  }

  const inUse = await User.count({ where: { role: role.name } });
  if (inUse) {
    throw ApiError.badRequest(
      `Role is assigned to ${inUse} user(s); reassign them before deleting`,
    );
  }

  await role.destroy();
  invalidateCache();
}

module.exports = {
  SYSTEM_ROLES,
  ensureSystemRoles,
  getPermissions,
  getRoleLabel,
  invalidateCache,
  listRoles,
  getRoleById,
  createRole,
  updateRole,
  deleteRole,
};
