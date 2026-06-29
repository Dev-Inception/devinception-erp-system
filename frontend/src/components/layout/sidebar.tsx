import { NavLink } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/store/auth';
import { usePermissionsStore } from '@/store/permissions';
import { MODULES, SECTION_ORDER } from '@/lib/modules';

export function Sidebar() {
  const role = useAuthStore((s) => s.user?.role);
  // Subscribe to access so the nav re-renders when the super admin tunes permissions.
  const access = usePermissionsStore((s) => s.access);

  const visible = (key: string, superAdminOnly?: boolean) => {
    if (superAdminOnly) return role === 'SUPER_ADMIN';
    if (role === 'SUPER_ADMIN') return true;
    if (!role) return false;
    return (access[role] ?? []).includes(key);
  };

  const groups = SECTION_ORDER.map((section) => ({
    section,
    items: MODULES.filter((m) => m.section === section && visible(m.key, m.superAdminOnly)),
  })).filter((g) => g.items.length > 0);

  return (
    <aside className="hidden md:flex w-64 shrink-0 flex-col border-r bg-card">
      <div className="flex h-16 items-center gap-2 border-b px-6">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground font-bold">
          D
        </div>
        <span className="font-semibold tracking-tight">DevInception</span>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4">
        {groups.map((group) => (
          <div key={group.section} className="mb-4">
            <p className="px-3 pb-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">
              {group.section}
            </p>
            {group.items.map((item) => (
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
        ))}
      </nav>
    </aside>
  );
}
