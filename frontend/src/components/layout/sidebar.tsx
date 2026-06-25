import { NavLink } from 'react-router-dom';
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
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Role } from '@/store/auth';
import { useAuthStore } from '@/store/auth';

interface NavItem {
  to: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  roles?: Role[];
}

const NAV: { section: string; items: NavItem[] }[] = [
  {
    section: 'Overview',
    items: [{ to: '/', label: 'Dashboard', icon: LayoutDashboard }],
  },
  {
    section: 'Operations',
    items: [
      { to: '/pos', label: 'Point of Sale', icon: ShoppingCart, roles: ['CASHIER', 'MANAGER', 'ADMIN'] },
      { to: '/sales', label: 'Sales', icon: ScrollText },
      { to: '/purchases', label: 'Goods Purchase', icon: Boxes, roles: ['MANAGER', 'ADMIN', 'ACCOUNTANT'] },
      { to: '/invoices', label: 'Invoices', icon: FileText },
    ],
  },
  {
    section: 'Catalog',
    items: [
      { to: '/products', label: 'Inventory', icon: Package },
      { to: '/warehouses', label: 'Warehouses', icon: Warehouse, roles: ['MANAGER', 'ADMIN'] },
    ],
  },
  {
    section: 'Partners',
    items: [
      { to: '/customers', label: 'Customers', icon: Users },
      { to: '/vendors', label: 'Vendors', icon: Truck },
    ],
  },
  {
    section: 'Finance',
    items: [
      { to: '/ledgers', label: 'Ledgers', icon: BookOpenCheck, roles: ['ACCOUNTANT', 'MANAGER', 'ADMIN'] },
      { to: '/reports', label: 'Reports', icon: BarChart3 },
      { to: '/cash', label: 'Cash & Bank', icon: Wallet, roles: ['ACCOUNTANT', 'MANAGER', 'ADMIN'] },
    ],
  },
  {
    section: 'System',
    items: [{ to: '/settings', label: 'Settings', icon: Settings, roles: ['ADMIN'] }],
  },
];

export function Sidebar() {
  const hasRole = useAuthStore((s) => s.hasRole);

  return (
    <aside className="hidden md:flex w-64 shrink-0 flex-col border-r bg-card">
      <div className="flex h-16 items-center gap-2 border-b px-6">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground font-bold">
          D
        </div>
        <span className="font-semibold tracking-tight">DevInception</span>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4">
        {NAV.map((group) => {
          const visible = group.items.filter((i) => !i.roles || hasRole(...i.roles));
          if (!visible.length) return null;
          return (
            <div key={group.section} className="mb-4">
              <p className="px-3 pb-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                {group.section}
              </p>
              {visible.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.to === '/'}
                  className={({ isActive }) =>
                    cn(
                      'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                      isActive
                        ? 'bg-primary/10 text-primary'
                        : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                    )
                  }
                >
                  <item.icon className="h-4 w-4" />
                  {item.label}
                </NavLink>
              ))}
            </div>
          );
        })}
      </nav>
    </aside>
  );
}
