import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check } from 'lucide-react';
import { api } from '@/lib/api';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import {
  CONFIGURABLE_MODULES,
  MODULE_PERMISSION,
  MODULE_PERMISSION_BUNDLE,
  grantsPermission,
} from '@/lib/modules';
import { useAuthStore, type Role } from '@/store/auth';
import { useStorefrontFilter } from '@/store/storefront';

interface RolePermissions {
  id: string;
  name: string; // technical key — never display this, see `label`
  label: string;
  permissions: string[];
  isSystem: boolean;
}

const ROLE_LABELS: Record<Role, string> = {
  SUPER_ADMIN: 'Super Admin',
  ADMIN: 'Admin',
  MANAGER: 'Manager',
  CASHIER: 'Cashier',
  ACCOUNTANT: 'Accountant',
};

/** "store manager" -> "Store Manager"; falls back to the built-in label if known. */
function roleLabel(name: string): string {
  const known = ROLE_LABELS[name.toUpperCase() as Role];
  if (known) return known;
  return name
    .split(/[\s_]+/)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(' ');
}

function ModuleAccessCard() {
  const qc = useQueryClient();
  const isSuperAdmin = useAuthStore((s) => s.user?.role) === 'SUPER_ADMIN';
  const storefront = useStorefrontFilter();
  // Super admin sees every built-in + every tenant's custom roles only while
  // on "All Stores"; picking one specific store shows exactly what that
  // store's own admin would see here — its own custom roles, no built-ins.
  const viewingAllStores = isSuperAdmin && !storefront.store;
  const { data: roles = [], isLoading } = useQuery<RolePermissions[]>({
    queryKey: ['roles', storefront.store],
    queryFn: async () => (await api.get('/roles', { params: storefront })).data,
  });

  // Super Admin itself never gets a column (it's locked server-side and
  // always has full access). Every other built-in only shows on the "All
  // Stores" overview — a store admin (or super admin viewing "as" one store)
  // configures only their own custom roles here; a built-in is shared by
  // every tenant using it, so it isn't "theirs" to configure (they still
  // assign it to staff from the Users page as normal).
  const configurableRoles = roles.filter(
    (r) => r.name.toUpperCase() !== 'SUPER_ADMIN' && (viewingAllStores || !r.isSystem),
  );

  const update = useMutation({
    mutationFn: async ({ id, permissions }: { id: string; permissions: string[] }) =>
      (await api.patch(`/roles/${id}`, { permissions })).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['roles'] }),
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'Could not update access'),
  });

  const toggle = (rec: RolePermissions, moduleKey: string) => {
    const perm = MODULE_PERMISSION[moduleKey];
    if (!perm) return;
    // A module with a read/create/update split (see MODULE_PERMISSION_BUNDLE)
    // grants or revokes the whole bundle together — checking the box means
    // "let this role manage it," not just "let them view it."
    const bundle = MODULE_PERMISSION_BUNDLE[moduleKey] ?? [perm];
    const permissions = grantsPermission(rec.permissions, perm)
      ? rec.permissions.filter((p) => !bundle.includes(p))
      : [...new Set([...rec.permissions, ...bundle])];
    update.mutate({ id: rec.id, permissions });
  };

  return (
    <Card className="overflow-hidden">
      <CardHeader className="space-y-1.5">
        <CardTitle>Module Access</CardTitle>
        <CardDescription>
          Controls each role's real permissions on the server — a checked box grants that module's
          governing permission, and for most modules that includes add/update, not just viewing. (A
          few — Roles, Day Book, Gate Passes — only control visibility; managing those stays gated
          by role/store ownership regardless of this checkbox.) Super Admin always has full access.
          (Dashboard, Reports and Day Book share a permission, so they toggle together.)
        </CardDescription>
      </CardHeader>
      <CardContent className="px-0 pb-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-3 font-medium">Role</th>
                {CONFIGURABLE_MODULES.map((m) => (
                  <th key={m.key} className="px-3 py-3 text-center font-medium" title={m.section}>
                    <span className="whitespace-nowrap normal-case">{m.label}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr>
                  <td
                    colSpan={CONFIGURABLE_MODULES.length + 1}
                    className="px-4 py-10 text-center text-muted-foreground"
                  >
                    Loading…
                  </td>
                </tr>
              )}
              {!isLoading &&
                configurableRoles.map((rec) => {
                  const locked = rec.isSystem && !isSuperAdmin;
                  return (
                    <tr key={rec.id} className="border-b last:border-0 hover:bg-muted/30">
                      <td className="px-4 py-3 font-medium">
                        {roleLabel(rec.label)}
                        {rec.isSystem && (
                          <span className="ml-2 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                            Built-in
                          </span>
                        )}
                      </td>
                      {CONFIGURABLE_MODULES.map((m) => {
                        const enabled = grantsPermission(rec.permissions, MODULE_PERMISSION[m.key]);
                        return (
                          <td key={m.key} className="px-3 py-3 text-center">
                            <button
                              type="button"
                              role="checkbox"
                              aria-checked={enabled}
                              aria-label={`${m.label} for ${roleLabel(rec.label)}`}
                              disabled={update.isPending || locked}
                              title={
                                locked ? 'Only a super admin can change a built-in role' : undefined
                              }
                              onClick={() => toggle(rec, m.key)}
                              className={cn(
                                'inline-flex h-5 w-5 items-center justify-center rounded border transition-colors disabled:opacity-50',
                                enabled
                                  ? 'border-primary bg-primary text-primary-foreground'
                                  : 'border-input bg-transparent hover:border-primary/50',
                              )}
                            >
                              {enabled && <Check className="h-3.5 w-3.5" />}
                            </button>
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              {!isLoading && configurableRoles.length === 0 && (
                <tr>
                  <td
                    colSpan={CONFIGURABLE_MODULES.length + 1}
                    className="px-4 py-10 text-center text-muted-foreground"
                  >
                    No roles yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

// Visibility is already handled by ModuleGuard (see App.tsx), which gates
// this whole route on the `permissions` module's governing permission
// (roles:update — see MODULE_PERMISSION in lib/modules.ts) before this
// component ever renders, so no in-component role check is needed here.
// User management now lives on its own page (see users.tsx) — this one is
// just the platform-wide role/module-access matrix, which stays super-admin-
// only since a role's permissions apply to every tenant that uses it.
export function PermissionsPage() {
  return (
    <div className="space-y-4">
      <ModuleAccessCard />
    </div>
  );
}
