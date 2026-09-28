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

  // Labour management (labourers charged for loading/unloading on a sale or
  // stock receipt) — previously reused sales:create for reads and was
  // super-admin-only to write; now scoped like vendors/suppliers/transporters.
  LABOUR_READ: 'labour:read',
  LABOUR_CREATE: 'labour:create',
  LABOUR_UPDATE: 'labour:update',
  LABOUR_DELETE: 'labour:delete',

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

  // Damaged stock (goods received damaged on a stock receipt, tracked
  // separately from sellable warehouse stock until sent back to the
  // supplier)
  DAMAGED_STOCK_READ: 'damaged-stock:read',
  DAMAGED_STOCK_MANAGE: 'damaged-stock:manage',

  // Vendor sales (a vendor buying stock from us — the mirror of the vendor
  // payable tracked under vendors:*). Payments/statements for this ledger
  // reuse FINANCE_READ/FINANCE_MANAGE below, same as the existing vendor AP
  // payments.
  VENDOR_SALES_READ: 'vendor-sales:read',
  VENDOR_SALES_MANAGE: 'vendor-sales:manage',

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

  // Expenses — separate from finance:manage so a role can record/approve
  // day-to-day spend without also being able to manage bank accounts, cash
  // entries, or vendor/supplier/labour/transport payments.
  EXPENSES_MANAGE: 'expenses:manage',
  // Sign-off (approve/reject) is kept separate from EXPENSES_MANAGE so a
  // role can record expenses without also being able to authorize spend.
  EXPENSES_APPROVE: 'expenses:approve',

  // Pricing a pending entity (vendor-sourced sale line or supplier stock
  // receipt line) is what actually creates the party's payable, so it's
  // kept separate from the general finance:read visibility over PEs.
  PENDING_ENTITIES_PRICE: 'pending-entities:price',

  // Reports
  REPORTS_READ: 'reports:read',

  // Company settings
  SETTINGS_READ: 'settings:read',
  SETTINGS_MANAGE: 'settings:manage',

  // Subscriptions (super admin sells stores to tenant admins) — granted only
  // via the super_admin wildcard, never assigned to a custom/system role.
  SUBSCRIPTIONS_MANAGE: 'subscriptions:manage',
};

const PERMISSION_VALUES = Object.values(PERMISSIONS);

// True if `permissions` (array or Set) grants `permission`, honoring wildcard.
function grants(permissions, permission) {
  const set = permissions instanceof Set ? permissions : new Set(permissions);
  return set.has(WILDCARD) || set.has(permission);
}

module.exports = { PERMISSIONS, PERMISSION_VALUES, WILDCARD, grants };
