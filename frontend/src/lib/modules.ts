import { type ComponentType } from 'react';
import {
  LayoutDashboard,
  Package,
  ShoppingCart,
  ScrollText,
  FileText,
  Truck,
  Users,
  BookOpenCheck,
  BarChart3,
  Settings,
  Wallet,
  Boxes,
  Warehouse,
  ShieldCheck,
  Tags,
  Ruler,
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
}

/**
 * Single source of truth for navigable modules. The sidebar renders from this list,
 * and the Permissions screen builds its access matrix from it.
 */
export const MODULES: ModuleDef[] = [
  { key: 'dashboard', to: '/', label: 'Dashboard', section: 'Overview', icon: LayoutDashboard },
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
    key: 'purchases',
    to: '/purchases',
    label: 'Goods Purchase',
    section: 'Operations',
    icon: Boxes,
    defaultRoles: ['MANAGER', 'ADMIN', 'ACCOUNTANT'],
  },
  { key: 'invoices', to: '/invoices', label: 'Invoices', section: 'Operations', icon: FileText },
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
  { key: 'customers', to: '/customers', label: 'Customers', section: 'Partners', icon: Users },
  { key: 'vendors', to: '/vendors', label: 'Vendors', section: 'Partners', icon: Truck },
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
    key: 'cash',
    to: '/cash',
    label: 'Cash & Bank',
    section: 'Finance',
    icon: Wallet,
    defaultRoles: ['ACCOUNTANT', 'MANAGER', 'ADMIN'],
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
    superAdminOnly: true,
  },
];

/** Section render order for the sidebar. */
export const SECTION_ORDER = ['Overview', 'Operations', 'Catalog', 'Partners', 'Finance', 'System'];

/** Modules that appear as rows in the Permissions access matrix. */
export const CONFIGURABLE_MODULES = MODULES.filter((m) => !m.superAdminOnly);

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
  purchases: 'purchases:read',
  invoices: 'invoices:read',
  products: 'inventory:read',
  categories: 'inventory:manage',
  units: 'inventory:manage',
  warehouses: 'inventory:manage',
  customers: 'customers:read',
  vendors: 'vendors:read',
  ledgers: 'finance:read',
  reports: 'reports:read',
  cash: 'finance:manage',
  settings: 'settings:manage',
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
