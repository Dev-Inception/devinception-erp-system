import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Bell, KeyRound, LogOut, Moon, Sun } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ChangePasswordDialog } from '@/components/change-password-dialog';
import { useTheme } from '@/components/theme-provider';
import { useAuthStore } from '@/store/auth';
import { StoreSwitcher } from './store-switcher';
import { LanguageToggle } from './language-toggle';
import { MobileSidebar } from './mobile-sidebar';

const TITLES: Record<string, string> = {
  '/': 'Dashboard',
  '/pos': 'Point of Sale',
  '/sales': 'Sales',
  '/products': 'Inventory',
  '/categories': 'Categories',
  '/units': 'Units',
  '/warehouses': 'Warehouses',
  '/stores': 'Stores',
  '/customers': 'Customers',
  '/vendors': 'Vendors',
  '/labour': 'Labour',
  '/roles': 'Role',
  '/ledgers': 'Ledgers',
  '/reports': 'Reports',
  '/day-book': 'Day Book',
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
  const [changingPassword, setChangingPassword] = useState(false);

  const title = TITLES[pathname] ?? 'DevInception ERP';

  return (
    <header className="flex h-16 items-center justify-between gap-2 border-b bg-background/80 px-3 backdrop-blur md:px-6">
      <div className="flex min-w-0 items-center gap-1">
        <MobileSidebar />
        <div className="min-w-0">
          <h1 className="truncate text-lg font-semibold tracking-tight">{title}</h1>
          <p className="hidden text-xs text-muted-foreground sm:block">Home / {title}</p>
        </div>
      </div>

      <div className="flex min-w-0 items-center gap-2">
        {/* The store switcher stays visible at every width — it changes what
            data you're looking at, so it needs to be reachable without
            opening the drawer. Language/theme/notifications are lower
            priority and move into the hamburger drawer below `md` instead,
            since there's no room to spare on a phone/tablet width. */}
        <StoreSwitcher />

        <div className="hidden items-center gap-2 md:flex">
          <LanguageToggle />

          <Button variant="ghost" size="icon" onClick={toggle} aria-label="Toggle theme">
            <Sun className="h-4 w-4 dark:hidden" />
            <Moon className="hidden h-4 w-4 dark:block" />
          </Button>

          <Button variant="ghost" size="icon" aria-label="Notifications" className="relative">
            <Bell className="h-4 w-4" />
            <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-destructive" />
          </Button>
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="ml-2 flex items-center gap-3 border-l pl-3 outline-none"
              aria-label="Account menu"
            >
              <div className="hidden text-right sm:block">
                <p className="text-sm font-medium leading-none">{user?.fullName}</p>
                <p className="text-xs text-muted-foreground">{user?.role}</p>
              </div>
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
                {user?.fullName?.[0] ?? 'U'}
              </div>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => setChangingPassword(true)}>
              <KeyRound className="h-4 w-4" /> Change Password
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={async () => {
                await logout();
                navigate('/login');
              }}
            >
              <LogOut className="h-4 w-4" /> Log out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <ChangePasswordDialog open={changingPassword} onOpenChange={setChangingPassword} />
    </header>
  );
}
