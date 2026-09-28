import { useEffect, useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, UserPlus, ChevronDown, Pencil, Loader2, Eye, EyeOff } from 'lucide-react';
import { api } from '@/lib/api';
import { toast } from 'sonner';
import { useConfirmDelete } from '@/components/confirm-provider';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
  DialogClose,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { useAuthStore, type Role } from '@/store/auth';
import { useStorefrontFilter } from '@/store/storefront';
import { type ManagedUser } from '@/store/permissions';
import { grantsPermission } from '@/lib/modules';
import { useLanguage } from '@/components/language-provider';

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

/** Native select styled to match the Input component. Options come from the live role list
 *  (built-in + any custom roles created on the Roles page), not a hardcoded set. */
function RoleSelect({
  value,
  onChange,
  roles,
  id,
  disabled,
  title,
}: {
  value: string;
  onChange: (role: string) => void;
  roles: { name: string; label: string; isSystem?: boolean }[];
  id?: string;
  disabled?: boolean;
  title?: string;
}) {
  // A custom role can share a built-in's display name (e.g. a store's own
  // "Manager"), so tag non-system ones only when a built-in is actually
  // sitting alongside it in this same list — a store admin whose list is
  // entirely their own custom roles has nothing to disambiguate from.
  const hasBuiltIns = roles.some((r) => r.isSystem);

  return (
    <div className="relative" title={title}>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="flex h-9 w-full appearance-none rounded-md border border-input bg-transparent py-1 pl-3 pr-9 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:border-input disabled:cursor-not-allowed disabled:opacity-50"
      >
        {roles.map((r) => (
          <option key={r.name} value={r.name}>
            {roleLabel(r.label)}
            {hasBuiltIns && r.isSystem === false ? ' (Custom)' : ''}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
    </div>
  );
}

function CreateUserDialog({
  roles,
}: {
  roles: { name: string; label: string; store?: string; isSystem?: boolean }[];
}) {
  const qc = useQueryClient();
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [form, setForm] = useState<{
    fullName: string;
    email: string;
    password: string;
    role: string;
    store: string;
  }>({
    fullName: '',
    email: '',
    password: '',
    role: 'cashier',
    store: '',
  });

  // Every role but super_admin is confined to one storefront (see
  // utils/storeScope.js on the backend) — the store to lock them to is
  // decided here, at creation time.
  const isSuperAdmin = form.role.toUpperCase() === 'SUPER_ADMIN';
  // Built-in roles' permissions can only be tuned by a super admin (see
  // Module Access / roleService.js) — a store admin can't actually customize
  // Cashier/Manager/Accountant for their own store, so they only get offered
  // the roles they *can* configure: their own store's custom roles.
  const actorIsSuperAdmin = useAuthStore((s) => s.user?.role) === 'SUPER_ADMIN';
  const { data: stores = [] } = useQuery<{ id: string; name: string; code?: string }[]>({
    queryKey: ['stores'],
    queryFn: async () => (await api.get('/stores')).data,
    enabled: open,
  });

  // A custom role belongs to exactly one store, so once a store is picked,
  // only offer that store's own custom roles (plus built-ins, for a super
  // admin) — otherwise every tenant's identically-named "Cashier"/"Manager"
  // would show at once.
  const availableRoles = useMemo(
    () =>
      roles.filter((r) =>
        actorIsSuperAdmin
          ? r.isSystem || r.store === form.store
          : !r.isSystem && r.store === form.store,
      ),
    [roles, form.store, actorIsSuperAdmin],
  );

  // Once roles load (or the store selection narrows them), make sure the
  // selected role is actually one that exists in the current list.
  useEffect(() => {
    if (availableRoles.length && !availableRoles.some((r) => r.name === form.role)) {
      setForm((f) => ({ ...f, role: availableRoles[0].name }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [availableRoles]);

  const create = useMutation({
    mutationFn: async () =>
      (
        await api.post('/users', {
          ...form,
          store: isSuperAdmin ? undefined : form.store,
        })
      ).data,
    onSuccess: () => {
      const assignedLabel = roles.find((r) => r.name === form.role)?.label ?? form.role;
      toast.success(`${form.fullName} added as ${roleLabel(assignedLabel)}`);
      qc.invalidateQueries({ queryKey: ['users'] });
      setForm({
        fullName: '',
        email: '',
        password: '',
        role: roles[0]?.name ?? 'cashier',
        store: '',
      });
      setOpen(false);
    },
    onError: (e: any) =>
      toast.error(
        e?.response?.data?.message?.[0] ?? e?.response?.data?.message ?? 'Could not create user',
      ),
  });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    create.mutate();
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="h-4 w-4" /> {t('Add User')}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New User</DialogTitle>
          <DialogDescription>
            Create a user and assign a role. Their visible modules follow the role's access below.
          </DialogDescription>
        </DialogHeader>
        <form className="space-y-3" onSubmit={submit}>
          <div className="space-y-1.5">
            <Label>Full Name *</Label>
            <Input
              required
              value={form.fullName}
              onChange={(e) => setForm({ ...form, fullName: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Email *</Label>
            <Input
              required
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Password *</Label>
            <div className="relative">
              <Input
                required
                type={showPassword ? 'text' : 'password'}
                minLength={8}
                placeholder="At least 8 characters"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                className="pr-10"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                aria-pressed={showPassword}
                className="absolute inset-y-0 right-0 flex items-center px-3 text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none"
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>
          {!isSuperAdmin && (
            <div className="space-y-1.5">
              <Label htmlFor="new-user-store">Store *</Label>
              <div className="relative">
                <select
                  id="new-user-store"
                  required
                  value={form.store}
                  onChange={(e) => setForm({ ...form, store: e.target.value })}
                  className="flex h-9 w-full appearance-none rounded-md border border-input bg-transparent py-1 pl-3 pr-9 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:border-input"
                >
                  <option value="" disabled>
                    Select store…
                  </option>
                  {stores.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                      {s.code ? ` (${s.code})` : ''}
                    </option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              </div>
              <p className="text-xs text-muted-foreground">
                This user will only see and act on this store's data. Pick it first — the roles
                below are scoped to whichever store is selected.
              </p>
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="new-user-role">Role</Label>
            <RoleSelect
              id="new-user-role"
              value={form.role}
              onChange={(role) => setForm({ ...form, role })}
              roles={availableRoles}
            />
            {!isSuperAdmin && !form.store && (
              <p className="text-xs text-muted-foreground">
                {actorIsSuperAdmin
                  ? 'Showing built-in roles only — select a store above to also see its custom roles.'
                  : 'Select a store above to see its roles.'}
              </p>
            )}
            {!isSuperAdmin && !actorIsSuperAdmin && form.store && availableRoles.length === 0 && (
              <p className="text-xs text-muted-foreground">
                No custom roles yet for this store — add one on the Roles page first.
              </p>
            )}
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <DialogClose asChild>
              <Button type="button" variant="outline">
                {t('Cancel')}
              </Button>
            </DialogClose>
            <Button type="submit" disabled={create.isPending}>
              <UserPlus className="h-4 w-4" /> {t('Create User')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Edit a user: name, email, active status, and an optional password reset —
 * all in one place instead of scattered across separate actions. Password is
 * left blank to keep the current one; filling it force-sets a new one with
 * no current-password check (this is an admin override, not self-service).
 */
function EditUserDialog({
  user,
  isSelf,
  trigger,
}: {
  user: ManagedUser;
  isSelf: boolean;
  trigger: React.ReactNode;
}) {
  const qc = useQueryClient();
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [form, setForm] = useState({
    fullName: user.fullName,
    email: user.email,
    active: user.active,
    password: '',
  });

  useEffect(() => {
    if (open) {
      setForm({ fullName: user.fullName, email: user.email, active: user.active, password: '' });
      setShowPassword(false);
    }
  }, [open, user]);

  const save = useMutation({
    mutationFn: async () => {
      await api.patch(`/users/${user.id}`, { fullName: form.fullName, email: form.email });
      if (form.active !== user.active) {
        await api.patch(`/users/${user.id}/active`, { active: form.active });
      }
      if (form.password) {
        await api.patch(`/users/${user.id}/password`, { password: form.password });
      }
    },
    onSuccess: () => {
      toast.success('User updated');
      qc.invalidateQueries({ queryKey: ['users'] });
      setOpen(false);
    },
    onError: (e: any) =>
      toast.error(
        e?.response?.data?.message?.[0] ?? e?.response?.data?.message ?? 'Could not update user',
      ),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit User</DialogTitle>
          <DialogDescription>
            Update this user's name, email, and status. Leave the password blank to keep it
            unchanged.
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate();
          }}
        >
          <div className="space-y-1.5">
            <Label>Full Name *</Label>
            <Input
              required
              value={form.fullName}
              onChange={(e) => setForm({ ...form, fullName: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Email *</Label>
            <Input
              required
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label>New Password</Label>
            <div className="relative">
              <Input
                type={showPassword ? 'text' : 'password'}
                minLength={8}
                placeholder="Leave blank to keep current password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                className="pr-10"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                aria-pressed={showPassword}
                className="absolute inset-y-0 right-0 flex items-center px-3 text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none"
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Status</Label>
            <div className="flex gap-2">
              {(
                [
                  { value: true, label: 'Active' },
                  { value: false, label: 'Disabled' },
                ] as const
              ).map((opt) => (
                <button
                  key={String(opt.value)}
                  type="button"
                  disabled={isSelf}
                  title={isSelf ? 'You cannot change your own active status' : undefined}
                  onClick={() => setForm({ ...form, active: opt.value })}
                  className={cn(
                    'flex-1 rounded-md border px-3 py-1.5 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50',
                    form.active === opt.value
                      ? opt.value
                        ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-600'
                        : 'border-destructive/50 bg-destructive/10 text-destructive'
                      : 'border-input text-muted-foreground hover:bg-muted/50',
                  )}
                >
                  {t(opt.label)}
                </button>
              ))}
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <DialogClose asChild>
              <Button type="button" variant="outline">
                {t('Cancel')}
              </Button>
            </DialogClose>
            <Button type="submit" disabled={save.isPending}>
              {save.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              {t('Save')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function UsersPage() {
  const qc = useQueryClient();
  const { t } = useLanguage();
  const currentUser = useAuthStore((s) => s.user);
  const canEdit = grantsPermission(currentUser?.permissions, 'users:update');
  const storefront = useStorefrontFilter();
  const onError = (e: any) => toast.error(e?.response?.data?.message ?? 'Action failed');
  const invalidate = () => qc.invalidateQueries({ queryKey: ['users'] });

  const { data: users = [] } = useQuery<ManagedUser[]>({
    queryKey: ['users', storefront.store],
    queryFn: async () => (await api.get('/users', { params: storefront })).data,
  });
  // Live role list (built-in + custom roles added on the Roles page) for the assign-role dropdown.
  // Under "All Stores" this intentionally includes every owned store's own
  // custom roles (not just one), so it has to stay unfiltered by store here —
  // narrowing to one store's roles happens per user/dialog below, via
  // `rolesForStore`.
  const { data: roles = [] } = useQuery<
    { name: string; label: string; store?: string; isSystem?: boolean }[]
  >({
    queryKey: ['roles', storefront.store],
    queryFn: async () => (await api.get('/roles', { params: storefront })).data,
  });
  // Only one super admin is allowed system-wide — once one exists, don't
  // offer it as a role for new users (the backend rejects it anyway). Only a
  // super admin may grant the `admin` (store-owner) role at all — that's how
  // a store gets provisioned in the first place (see Subscriptions), not
  // something one store's admin should be able to mint for someone else.
  const actorIsSuperAdmin = currentUser?.role === 'SUPER_ADMIN';
  const hasSuperAdmin = users.some((u) => u.role === 'SUPER_ADMIN');
  // A store admin can't tune a built-in role's permissions (only a super
  // admin can, see Module Access / roleService.js), so built-ins aren't
  // "theirs" to hand out — they only get offered their own store's custom
  // roles. A super admin still sees the shared built-ins everywhere.
  const grantableRoles = roles.filter((r) => {
    if (!actorIsSuperAdmin) return r.isSystem === false;
    const name = r.name.toUpperCase();
    if (name === 'SUPER_ADMIN' && hasSuperAdmin) return false;
    return true;
  });
  // A custom role only belongs to the one store it was created for — a
  // multi-store admin's "Cashier" in Store A is a different role than their
  // "Cashier" in Store B, so only one store's worth should ever show at once.
  // Built-ins (isSystem) have no store and apply everywhere. A user already
  // holding a built-in role that's no longer offered (store admin case above)
  // still needs it present so their current value renders correctly.
  const rolesForStore = (storeId?: string, currentRoleName?: string) => {
    const scoped = grantableRoles.filter((r) => r.isSystem || r.store === storeId);
    if (currentRoleName && !scoped.some((r) => r.name === currentRoleName)) {
      const current = roles.find((r) => r.name === currentRoleName);
      if (current) return [current, ...scoped];
    }
    return scoped;
  };

  const setRole = useMutation({
    mutationFn: async ({ id, role }: { id: string; role: string }) =>
      (await api.patch(`/users/${id}/role`, { role })).data,
    onSuccess: invalidate,
    onError,
  });
  const setActive = useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) =>
      (await api.patch(`/users/${id}/active`, { active })).data,
    onSuccess: invalidate,
    onError,
  });
  const removeMut = useMutation({
    mutationFn: async (id: string) => (await api.delete(`/users/${id}`)).data,
    onSuccess: (_d, _id) => {
      toast.success('User removed');
      invalidate();
    },
    onError,
  });

  const updateUser = (id: string, patch: { role?: string; active?: boolean }) => {
    if (patch.role !== undefined) setRole.mutate({ id, role: patch.role });
    if (patch.active !== undefined) setActive.mutate({ id, active: patch.active });
  };
  const confirmDelete = useConfirmDelete();
  const remove = async (u: ManagedUser) => {
    if (await confirmDelete(`user "${u.fullName}"`)) removeMut.mutate(u.id);
  };

  return (
    <Card className="overflow-hidden">
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <div className="space-y-1.5">
          <CardTitle>Users</CardTitle>
          <CardDescription>
            Create your store's staff (managers, cashiers, accountants) and assign each one a role.
          </CardDescription>
        </div>
        <CreateUserDialog roles={grantableRoles} />
      </CardHeader>
      <CardContent className="px-0 pb-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-3 font-medium">User</th>
                <th className="px-4 py-3 font-medium">Email</th>
                <th className="px-4 py-3 font-medium">Role</th>
                <th className="px-4 py-3 font-medium">Store</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => {
                const isSelf = currentUser?.email === u.email;
                const isSuperAdmin = u.role === 'SUPER_ADMIN';
                return (
                  <tr key={u.id} className="border-b last:border-0 hover:bg-muted/30">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                          {u.fullName?.[0] ?? 'U'}
                        </div>
                        <span className="font-medium">{u.fullName}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{u.email}</td>
                    <td className="px-4 py-3">
                      <div className="w-40">
                        <RoleSelect
                          value={u.role.toLowerCase()}
                          onChange={(role) => updateUser(u.id, { role })}
                          roles={rolesForStore(u.storeId, u.role.toLowerCase())}
                          disabled={isSelf && isSuperAdmin}
                          title={
                            isSelf && isSuperAdmin
                              ? 'A super admin cannot change their own role'
                              : undefined
                          }
                        />
                      </div>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {u.storeName ??
                        (u.role === 'SUPER_ADMIN' || u.role === 'ADMIN' ? 'All stores' : '—')}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() => updateUser(u.id, { active: !u.active })}
                        className={cn(
                          'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors',
                          u.active
                            ? 'bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20'
                            : 'bg-muted text-muted-foreground hover:bg-muted/70',
                        )}
                      >
                        {u.active ? 'Active' : 'Disabled'}
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1">
                        {canEdit && (
                          <EditUserDialog
                            user={u}
                            isSelf={isSelf}
                            trigger={
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                aria-label={`Edit ${u.fullName}`}
                                title={t('Edit user')}
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                            }
                          />
                        )}
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          aria-label={`Remove ${u.fullName}`}
                          disabled={isSelf}
                          title={isSelf ? 'You cannot remove your own account' : 'Remove user'}
                          onClick={() => remove(u)}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {users.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">
                    No users yet.
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
