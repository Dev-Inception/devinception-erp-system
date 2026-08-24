/**
 * Permission catalog. Roles are data (see the Role model), but the set of
 * permissions a role may hold is fixed in code — that keeps authorization
 * checks in routes referring to stable constants instead of magic strings.
 *
 * A role whose permission list contains WILDCARD ("*") is treated as having
 * every permission, present and future. Only the seeded super_admin role
 * gets the wildcard; custom roles must enumerate explicit permissions.
 */
const WILDCARD = '*';

const PERMISSIONS = {
  // User management
  USERS_READ: 'users:read',
  USERS_CREATE: 'users:create',
  USERS_UPDATE: 'users:update',
  USERS_UPDATE_ROLE: 'users:update_role',
  USERS_SET_ACTIVE: 'users:set_active',
  USERS_SET_PASSWORD: 'users:set_password',
  USERS_DELETE: 'users:delete',

  // Role management
  ROLES_READ: 'roles:read',
  ROLES_CREATE: 'roles:create',
  ROLES_UPDATE: 'roles:update',
  ROLES_DELETE: 'roles:delete',

  // Vendor management
  VENDORS_READ: 'vendors:read',
  VENDORS_CREATE: 'vendors:create',
  VENDORS_UPDATE: 'vendors:update',
  VENDORS_DELETE: 'vendors:delete',

  // Supplier management
  SUPPLIERS_READ: 'suppliers:read',
  SUPPLIERS_CREATE: 'suppliers:create',
  SUPPLIERS_UPDATE: 'suppliers:update',
  SUPPLIERS_DELETE: 'suppliers:delete',

  // Transporter management
  TRANSPORTERS_READ: 'transporters:read',
  TRANSPORTERS_CREATE: 'transporters:create',
  TRANSPORTERS_UPDATE: 'transporters:update',
  TRANSPORTERS_DELETE: 'transporters:delete',

  // Customer management
  CUSTOMERS_READ: 'customers:read',
  CUSTOMERS_CREATE: 'customers:create',
  CUSTOMERS_UPDATE: 'customers:update',
  CUSTOMERS_DELETE: 'customers:delete',

  // Inventory (warehouses + products + stock)
  INVENTORY_READ: 'inventory:read',
  INVENTORY_MANAGE: 'inventory:manage',

  // Gate passes (truck dispatch authorization for sold/delivered stock)
  GATE_PASSES_READ: 'gate-passes:read',

  // Store management (storefront groupings of warehouses). Listing stores is
  // open to any authenticated user (see storeRoutes.js) since every user must
  // be able to populate the login picker and header switcher — only
  // create/update/delete need this permission.
  STORES_MANAGE: 'stores:manage',

  // POS sales
  SALES_READ: 'sales:read',
  SALES_CREATE: 'sales:create',
  // Editing an already-completed sale, recording a later payment against it,
  // and processing product returns against it.
  SALES_UPDATE: 'sales:update',

  // Customer estimates (quotes) — creation, follow-up, and conversion to a sale
  ESTIMATES_READ: 'estimates:read',
  ESTIMATES_CREATE: 'estimates:create',
  // Editing an estimate, logging a follow-up, and marking it lost.
  ESTIMATES_UPDATE: 'estimates:update',
  ESTIMATES_DELETE: 'estimates:delete',

  // Finance: ledgers, cash & bank, payments
  FINANCE_READ: 'finance:read',
  FINANCE_MANAGE: 'finance:manage',

  // Reports
  REPORTS_READ: 'reports:read',

  // Company settings
  SETTINGS_READ: 'settings:read',
  SETTINGS_MANAGE: 'settings:manage',
};

const PERMISSION_VALUES = Object.values(PERMISSIONS);

// True if `permissions` (array or Set) grants `permission`, honoring wildcard.
function grants(permissions, permission) {
  const set = permissions instanceof Set ? permissions : new Set(permissions);
  return set.has(WILDCARD) || set.has(permission);
}

module.exports = { PERMISSIONS, PERMISSION_VALUES, WILDCARD, grants };
