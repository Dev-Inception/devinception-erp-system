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
  { key: 'pos', to: '/pos', label: 'Point of Sale', section: 'Operations', icon: ShoppingCart, defaultRoles: ['CASHIER', 'MANAGER', 'ADMIN'] },
  { key: 'sales', to: '/sales', label: 'Sales', section: 'Operations', icon: ScrollText },
  { key: 'purchases', to: '/purchases', label: 'Goods Purchase', section: 'Operations', icon: Boxes, defaultRoles: ['MANAGER', 'ADMIN', 'ACCOUNTANT'] },
  { key: 'invoices', to: '/invoices', label: 'Invoices', section: 'Operations', icon: FileText },
  { key: 'products', to: '/products', label: 'Inventory', section: 'Catalog', icon: Package },
  { key: 'warehouses', to: '/warehouses', label: 'Warehouses', section: 'Catalog', icon: Warehouse, defaultRoles: ['MANAGER', 'ADMIN'] },
  { key: 'customers', to: '/customers', label: 'Customers', section: 'Partners', icon: Users },
  { key: 'vendors', to: '/vendors', label: 'Vendors', section: 'Partners', icon: Truck },
  { key: 'ledgers', to: '/ledgers', label: 'Ledgers', section: 'Finance', icon: BookOpenCheck, defaultRoles: ['ACCOUNTANT', 'MANAGER', 'ADMIN'] },
  { key: 'reports', to: '/reports', label: 'Reports', section: 'Finance', icon: BarChart3 },
  { key: 'cash', to: '/cash', label: 'Cash & Bank', section: 'Finance', icon: Wallet, defaultRoles: ['ACCOUNTANT', 'MANAGER', 'ADMIN'] },
  { key: 'settings', to: '/settings', label: 'Settings', section: 'System', icon: Settings, defaultRoles: ['ADMIN'] },
  { key: 'permissions', to: '/permissions', label: 'Permissions', section: 'System', icon: ShieldCheck, superAdminOnly: true },
];

/** Section render order for the sidebar. */
export const SECTION_ORDER = ['Overview', 'Operations', 'Catalog', 'Partners', 'Finance', 'System'];

/** Modules that appear as rows in the Permissions access matrix. */
export const CONFIGURABLE_MODULES = MODULES.filter((m) => !m.superAdminOnly);

/** The set of module keys a role can see by default, before any admin tuning. */
export function defaultModulesForRole(role: Role): string[] {
  return MODULES.filter((m) => {
    if (m.superAdminOnly) return role === 'SUPER_ADMIN';
    if (role === 'SUPER_ADMIN') return true;
    return (m.defaultRoles ?? CONFIGURABLE_ROLES).includes(role);
  }).map((m) => m.key);
}
