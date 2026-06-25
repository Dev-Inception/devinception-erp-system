import { useLocation, useNavigate } from 'react-router-dom';
import { Bell, Moon, Sun, LogOut, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useTheme } from '@/components/theme-provider';
import { useAuthStore } from '@/store/auth';
import { WarehouseSwitcher } from '@/components/layout/warehouse-switcher';

const TITLES: Record<string, string> = {
  '/': 'Dashboard',
  '/pos': 'Point of Sale',
  '/sales': 'Sales',
  '/purchases': 'Goods Purchase',
  '/invoices': 'Invoices',
  '/products': 'Inventory',
  '/warehouses': 'Warehouses',
  '/customers': 'Customers',
  '/vendors': 'Vendors',
  '/ledgers': 'Ledgers',
  '/reports': 'Reports',
  '/cash': 'Cash & Bank',
  '/settings': 'Settings',
  '/permissions': 'Permissions',
};

export function Header() {
  const { toggle } = useTheme();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);

  const title = TITLES[pathname] ?? 'DevInception ERP';

  return (
    <header className="flex h-16 items-center justify-between border-b bg-background/80 px-6 backdrop-blur">
      <div>
        <h1 className="text-lg font-semibold tracking-tight">{title}</h1>
        <p className="text-xs text-muted-foreground">Home / {title}</p>
      </div>

      <div className="flex items-center gap-2">
        <WarehouseSwitcher />
        <div className="relative hidden lg:block">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Search…" className="w-56 pl-8" />
        </div>

        <Button variant="ghost" size="icon" onClick={toggle} aria-label="Toggle theme">
          <Sun className="h-4 w-4 dark:hidden" />
          <Moon className="hidden h-4 w-4 dark:block" />
        </Button>

        <Button variant="ghost" size="icon" aria-label="Notifications" className="relative">
          <Bell className="h-4 w-4" />
          <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-destructive" />
        </Button>

        <div className="ml-2 flex items-center gap-3 border-l pl-3">
          <div className="hidden text-right sm:block">
            <p className="text-sm font-medium leading-none">{user?.fullName}</p>
            <p className="text-xs text-muted-foreground">{user?.role}</p>
          </div>
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
            {user?.fullName?.[0] ?? 'U'}
          </div>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Log out"
            onClick={() => {
              logout();
              navigate('/login');
            }}
          >
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </header>
  );
}
