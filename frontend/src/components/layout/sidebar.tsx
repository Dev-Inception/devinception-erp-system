import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { api } from '@/lib/api';
import { useAuthStore } from '@/store/auth';
import { MODULES, SECTION_ORDER, canSeeModule } from '@/lib/modules';

const STORAGE_KEY = 'devinception-sidebar-collapsed';

export function Sidebar() {
  // Gate nav by the current user's real backend permissions (from login/me).
  const role = useAuthStore((s) => s.user?.role);
  const permissions = useAuthStore((s) => s.user?.permissions);
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem(STORAGE_KEY) === '1');

  const toggle = () => {
    setCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem(STORAGE_KEY, next ? '1' : '0');
      return next;
    });
  };

  const groups = SECTION_ORDER.map((section) => ({
    section,
    items: MODULES.filter((m) => m.section === section && canSeeModule(role, permissions, m)),
  })).filter((g) => g.items.length > 0);
  const canSeePendingEntities = groups.some((g) =>
    g.items.some((m) => m.key === 'pending-entities'),
  );
  // Unpriced entities need a super admin's action — a red dot flags that
  // without making anyone open the page just to check.
  const { data: pendingEntitiesCount = 0 } = useQuery({
    queryKey: ['pending-entities-count'],
    queryFn: async () =>
      (await api.get('/pending-entities', { params: { status: 'PENDING', limit: 1 } })).data
        .total ?? 0,
    enabled: canSeePendingEntities,
    refetchInterval: 60_000,
  });

  return (
    <aside
      className={cn(
        'relative hidden md:flex h-screen shrink-0 flex-col border-r bg-card transition-[width] duration-200',
        collapsed ? 'w-16' : 'w-64',
      )}
    >
      <div className="flex h-16 shrink-0 items-center gap-2 border-b px-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground font-bold">
          D
        </div>
        {!collapsed && (
          <span className="flex-1 truncate font-semibold tracking-tight">DevInception</span>
        )}
      </div>

      {/* Anchored to the sidebar's border, vertically centered on the header —
          stays in the same spot whether collapsed or expanded, instead of
          competing with the logo for space inside the header row. */}
      <button
        type="button"
        onClick={toggle}
        aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        className="absolute -right-3 top-5 z-10 flex h-6 w-6 items-center justify-center rounded-full border bg-background text-muted-foreground shadow-sm transition-colors hover:bg-accent hover:text-foreground"
      >
        {collapsed ? (
          <ChevronRight className="h-3.5 w-3.5" />
        ) : (
          <ChevronLeft className="h-3.5 w-3.5" />
        )}
      </button>

      <nav className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-3 py-4">
        {groups.map((group) => (
          <div key={group.section} className="mb-4">
            {!collapsed && (
              <p className="px-3 pb-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                {group.section}
              </p>
            )}
            {group.items.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === '/'}
                title={collapsed ? item.label : undefined}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                    collapsed && 'justify-center px-0',
                    isActive
                      ? 'bg-primary/10 text-primary'
                      : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                  )
                }
              >
                <span className="relative shrink-0">
                  <item.icon className="h-4 w-4" />
                  {collapsed && item.key === 'pending-entities' && pendingEntitiesCount > 0 && (
                    <span
                      className="absolute -right-1 -top-1 flex h-2.5 w-2.5"
                      title={`${pendingEntitiesCount} pending`}
                    >
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-destructive opacity-75" />
                      <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-destructive" />
                    </span>
                  )}
                </span>
                {!collapsed && (
                  <span className="flex flex-1 items-center gap-1.5 truncate">
                    <span className="truncate">{item.label}</span>
                    {item.key === 'pending-entities' && pendingEntitiesCount > 0 && (
                      <span
                        className="relative flex h-2.5 w-2.5 shrink-0"
                        title={`${pendingEntitiesCount} pending`}
                      >
                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-destructive opacity-75" />
                        <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-destructive" />
                      </span>
                    )}
                  </span>
                )}
              </NavLink>
            ))}
          </div>
        ))}
      </nav>
    </aside>
  );
}
