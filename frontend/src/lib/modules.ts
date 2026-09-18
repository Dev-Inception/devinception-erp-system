import { type ComponentType } from 'react';
import {
  LayoutDashboard,
  Package,
  ShoppingCart,
  ScrollText,
  Truck,
  Users,
  BookOpenCheck,
  BarChart3,
  Settings,
  Wallet,
  Warehouse,
  ShieldCheck,
  Tags,
  Ruler,
  HardHat,
  ClipboardCheck,
  PackagePlus,
  PackageX,
  BookText,
  Store,
  FileText,
  Receipt,
  Hourglass,
  Container,
  Factory,
  CreditCard,
  HandCoins,
} from 'lucide-react';
import type { Role } from '@/store/auth';

/** Every role that can be assigned to a user. */
export const ROLES: Role[] = ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'CASHIER', 'ACCOUNTANT'];

/**
 * Roles whose module access can be tuned in the Permissions screen. SUPER_ADMIN is
 * intentionally excluded — it always sees everything and configures the rest.
 */
export const CONFIGURABLE_ROLES: Role[] = ['ADMIN', 'MANAGER', 'CASHIER', 'ACCOUNTANT'];

export interface ModuleDef {
  /** Stable identifier used as the permission key (do not rename once persisted). */
  key: string;
  to: string;
  label: string;
  section: string;
  icon: ComponentType<{ className?: string }>;
  /**
   * Configurable roles that can see this module out of the box. Omit to default it
   * on for every configurable role. SUPER_ADMIN always sees it regardless.
   */
  defaultRoles?: Role[];
  /** Only the super admin ever sees this — it is not part of the access matrix. */
  superAdminOnly?: boolean;
  /** Operational administration visible only to admin and super admin. */
  adminOnly?: boolean;
}

/**
 * Single source of truth for navigable modules. The sidebar renders from this list,
 * and the Permissions screen builds its access matrix from it.
 */
export const MODULES: ModuleDef[] = [
  { key: 'dashboard', to: '/', label: 'Dashboard', section: 'Overview', icon: LayoutDashboard },
  {
    key: 'pending-entities',
    to: '/pending-entities',
    label: 'Pending Entities',
    section: 'Overview',
    icon: Hourglass,
    defaultRoles: ['ACCOUNTANT', 'MANAGER', 'ADMIN'],
  },
  {
    key: 'pos',
    to: '/pos',
    label: 'Point of Sale',
    section: 'Operations',
    icon: ShoppingCart,
    defaultRoles: ['CASHIER', 'MANAGER', 'ADMIN'],
  },
  { key: 'sales', to: '/sales', label: 'Sales', section: 'Operations', icon: ScrollText },
  {
    key: 'vendor-sales',
    to: '/vendor-sales',
    label: 'Vendor Sales',
    section: 'Operations',
    icon: HandCoins,
    defaultRoles: ['MANAGER', 'ADMIN'],
  },
  {
    key: 'estimates',
    to: '/estimates',
    label: 'Estimates',
    section: 'Operations',
    icon: FileText,
    defaultRoles: ['CASHIER', 'MANAGER', 'ADMIN'],
  },
  {
    key: 'stock-receipts',
    to: '/stock-receipts',
    label: 'Stock Receiving',
    section: 'Operations',
    icon: PackagePlus,
    defaultRoles: ['MANAGER', 'ADMIN'],
  },
  {
    key: 'gate-passes',
    to: '/gate-passes',
    label: 'Gate Passes',
    section: 'Operations',
    icon: ClipboardCheck,
    defaultRoles: ['ADMIN'],
  },
  {
    key: 'damaged-stock',
    to: '/damaged-stock',
    label: 'Damaged Stock',
    section: 'Operations',
    icon: PackageX,
    defaultRoles: ['MANAGER', 'ADMIN'],
  },
  { key: 'products', to: '/products', label: 'Inventory', section: 'Catalog', icon: Package },
  {
    key: 'categories',
    to: '/categories',
    label: 'Categories',
    section: 'Catalog',
    icon: Tags,
    defaultRoles: ['MANAGER', 'ADMIN'],
  },
  {
    key: 'units',
    to: '/units',
    label: 'Units',
    section: 'Catalog',
    icon: Ruler,
    defaultRoles: ['MANAGER', 'ADMIN'],
  },
  {
    key: 'warehouses',
    to: '/warehouses',
    label: 'Warehouses',
    section: 'Catalog',
    icon: Warehouse,
    defaultRoles: ['MANAGER', 'ADMIN'],
  },
  {
    key: 'stores',
    to: '/stores',
    label: 'Stores',
    section: 'Catalog',
    icon: Store,
    defaultRoles: ['ADMIN'],
    adminOnly: true,
  },
  { key: 'customers', to: '/customers', label: 'Customers', section: 'Partners', icon: Users },
  { key: 'vendors', to: '/vendors', label: 'Vendors', section: 'Partners', icon: Truck },
  { key: 'suppliers', to: '/suppliers', label: 'Suppliers', section: 'Partners', icon: Factory },
  {
    key: 'transporters',
    to: '/transporters',
    label: 'Transporters',
    section: 'Partners',
    icon: Container,
  },
  {
    key: 'labour',
    to: '/labour',
    label: 'Labour',
    section: 'Partners',
    icon: HardHat,
    defaultRoles: ['CASHIER', 'MANAGER', 'ADMIN'],
  },
  {
    key: 'ledgers',
    to: '/ledgers',
    label: 'Ledgers',
    section: 'Finance',
    icon: BookOpenCheck,
    defaultRoles: ['ACCOUNTANT', 'MANAGER', 'ADMIN'],
  },
  { key: 'reports', to: '/reports', label: 'Reports', section: 'Finance', icon: BarChart3 },
  {
    key: 'expenses',
    to: '/expenses',
    label: 'Expenses',
    section: 'Finance',
    icon: Receipt,
    defaultRoles: ['ACCOUNTANT', 'MANAGER', 'ADMIN'],
  },
  {
    key: 'day-book',
    to: '/day-book',
    label: 'Day Book',
    section: 'Finance',
    icon: BookText,
  },
  {
    key: 'cash',
    to: '/cash',
    label: 'Cash & Bank',
    section: 'Finance',
    icon: Wallet,
    defaultRoles: ['ACCOUNTANT', 'MANAGER', 'ADMIN'],
  },
  { key: 'roles', to: '/roles', label: 'Roles', section: 'System', icon: Users },
  {
    key: 'users',
    to: '/users',
    label: 'Users',
    section: 'System',
    icon: Users,
    // A store admin manages their own store's staff (see backend
    // userService.js — creates/edits/removes are already scoped to their own
    // store); super admin sees/manages every store's staff.
    adminOnly: true,
  },
  {
    key: 'settings',
    to: '/settings',
    label: 'Settings',
    section: 'System',
    icon: Settings,
    defaultRoles: ['ADMIN'],
  },
  {
    key: 'permissions',
    to: '/permissions',
    label: 'Permissions',
    section: 'System',
    icon: ShieldCheck,
    // No configurable role gets this by default — user management and the
    // module access matrix live here, so a super admin has to opt a role in
    // explicitly rather than it defaulting open (matters only for the legacy
    // no-`permissions`-loaded fallback in defaultModulesForRole below; a real
    // session is always gated by MODULE_PERMISSION.permissions instead).
    defaultRoles: [],
  },
  {
    key: 'subscriptions',
    to: '/subscriptions',
    label: 'Subscriptions',
    section: 'System',
    icon: CreditCard,
    // Selling/provisioning stores is the company's own business, not a
    // tenant's — only the super admin ever sees or manages it.
    superAdminOnly: true,
  },
];

/** Section render order for the sidebar. */
export const SECTION_ORDER = ['Overview', 'Operations', 'Catalog', 'Partners', 'Finance', 'System'];

/** Modules that appear as rows in the Permissions access matrix. */
export const CONFIGURABLE_MODULES = MODULES.filter((m) => !m.superAdminOnly && !m.adminOnly);

/** Wildcard permission — a role holding it is granted everything. */
export const WILDCARD_PERMISSION = '*';

/**
 * Governing backend permission for each configurable module: a role sees the
 * module iff it holds this permission (or the wildcard). These mirror the
 * permission each module's primary route requires on the backend.
 *
 * Note: `dashboard` and `reports` both map to `reports:read` (there is no
 * separate dashboard permission), so those two toggle together.
 */
export const MODULE_PERMISSION: Record<string, string> = {
  dashboard: 'reports:read',
  pos: 'sales:create',
  sales: 'sales:read',
  estimates: 'estimates:read',
  'stock-receipts': 'inventory:read',
  'gate-passes': 'gate-passes:read',
  'damaged-stock': 'damaged-stock:read',
  products: 'inventory:read',
  categories: 'inventory:manage',
  units: 'inventory:manage',
  warehouses: 'inventory:manage',
  stores: 'stores:manage',
  customers: 'customers:read',
  vendors: 'vendors:read',
  'vendor-sales': 'vendor-sales:read',
  suppliers: 'suppliers:read',
  transporters: 'transporters:read',
  // No dedicated backend permission — the Roles page only lets a non-super-
  // admin *see* role definitions (creating/editing is separately gated by
  // `canManage` inside the page itself, hardcoded to super admin), so
  // roles:read (currently held by nobody but super admin) is a reasonable,
  // purely opt-in visibility gate.
  roles: 'roles:read',
  // Labour now has its own dedicated permissions (see permissions.js) — this
  // was stale from before that split and pointed at sales:create, so
  // checking "Labour" silently granted an unrelated POS permission instead
  // of ever actually unlocking Labour access.
  labour: 'labour:read',
  ledgers: 'finance:read',
  'pending-entities': 'finance:read',
  reports: 'reports:read',
  expenses: 'expenses:manage',
  // Same governing permission as Reports — the Day Book is another report
  // view (see reportRoutes.js), not a distinct backend permission.
  'day-book': 'reports:read',
  cash: 'finance:manage',
  settings: 'settings:manage',
  // User management + this very module-access matrix. roles:update isn't
  // held by anyone but super admin today, so this stays opt-in — a super
  // admin has to deliberately grant a role access to it (see the
  // defaultRoles note on the `permissions` module above).
  permissions: 'roles:update',
};

/**
 * Some modules' backend permission model splits read from create/update
 * (see permissions.js) rather than covering everything with one permission
 * the way inventory:manage does for Categories/Units/Warehouses. For those,
 * checking the module's box in Module Access grants the whole bundle, not
 * just read — a super admin ticking "Labour" means "let this role manage
 * Labour," not "let them only look at it." Modules not listed here keep
 * toggling their single MODULE_PERMISSION value only.
 */
export const MODULE_PERMISSION_BUNDLE: Record<string, string[]> = {
  customers: ['customers:read', 'customers:create', 'customers:update'],
  vendors: ['vendors:read', 'vendors:create', 'vendors:update'],
  // Vendor Sales has its own read/manage split (see permissions.js), same
  // shape as damaged-stock/pending-entities above.
  'vendor-sales': ['vendor-sales:read', 'vendor-sales:manage'],
  suppliers: ['suppliers:read', 'suppliers:create', 'suppliers:update'],
  transporters: ['transporters:read', 'transporters:create', 'transporters:update'],
  labour: ['labour:read', 'labour:create', 'labour:update'],
  // Sales the page (view/edit/refund/record-payment against an existing
  // sale) is deliberately separate from POS (making a brand new one, see
  // `pos` above, sales:create) — so this bundle stops at update, not create.
  sales: ['sales:read', 'sales:update'],
  // Estimates has no POS-style split — one page covers the whole lifecycle
  // (create a quote, follow up, mark lost, edit), so its bundle covers all
  // three.
  estimates: ['estimates:read', 'estimates:create', 'estimates:update'],
  // `inventory:manage` is one combined backend permission covering
  // Stock Receiving, Products, Categories, Units, and Warehouses together —
  // there's no separate "manage stock receipts only" permission on the
  // backend, so checking any one of these necessarily grants write access
  // to all of them. That's a backend permission-model characteristic, not
  // introduced here.
  'stock-receipts': ['inventory:read', 'inventory:manage'],
  products: ['inventory:read', 'inventory:manage'],
  // Damaged stock has its own read/manage split (see permissions.js), same
  // shape as inventory:read/manage above.
  'damaged-stock': ['damaged-stock:read', 'damaged-stock:manage'],
  // Pricing a pending entity (the module's one real action) needs its own
  // permission distinct from just reading the finance section.
  'pending-entities': ['finance:read', 'pending-entities:price'],
};

/** True if a permission list grants `permission`, honoring the wildcard. */
export function grantsPermission(perms: string[] | undefined, permission: string): boolean {
  if (!perms) return false;
  return perms.includes(WILDCARD_PERMISSION) || perms.includes(permission);
}

/** The set of module keys a role can see by default, before any admin tuning. */
export function defaultModulesForRole(role: Role): string[] {
  return MODULES.filter((m) => {
    if (m.superAdminOnly) return role === 'SUPER_ADMIN';
    if (role === 'SUPER_ADMIN') return true;
    return (m.defaultRoles ?? CONFIGURABLE_ROLES).includes(role);
  }).map((m) => m.key);
}

/**
 * Whether the current user may see a module. Super Admin sees everything;
 * everyone else is gated by their real backend permissions. Sessions predating
 * permission-aware login (no `permissions`) fall back to per-role defaults.
 */
export function canSeeModule(
  role: Role | undefined,
  permissions: string[] | undefined,
  m: ModuleDef,
): boolean {
  if (m.superAdminOnly) return role === 'SUPER_ADMIN';
  if (m.adminOnly) return role === 'ADMIN' || role === 'SUPER_ADMIN';
  if (role === 'SUPER_ADMIN') return true;
  if (!role) return false;
  if (!permissions) return defaultModulesForRole(role).includes(m.key);
  const required = MODULE_PERMISSION[m.key];
  return required ? grantsPermission(permissions, required) : true;
}

/**
 * The route the user should land on: the first module (in nav order) they can
 * actually see. Used after login and to redirect away from an inaccessible '/'.
 * Returns '/' only in the degenerate case of no visible module.
 */
export function landingPath(role: Role | undefined, permissions: string[] | undefined): string {
  const first = MODULES.find((m) => canSeeModule(role, permissions, m));
  return first ? first.to : '/';
}
