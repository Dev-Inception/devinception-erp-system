import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Plus,
  Trash2,
  Check,
  UserPlus,
  ChevronDown,
  Pencil,
  Loader2,
  Eye,
  EyeOff,
} from 'lucide-react';
import { api } from '@/lib/api';
import { toast } from 'sonner';
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
import { type ManagedUser } from '@/store/permissions';
import { CONFIGURABLE_MODULES, MODULE_PERMISSION, grantsPermission } from '@/lib/modules';
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
  roles: { name: string }[];
  id?: string;
  disabled?: boolean;
  title?: string;
}) {
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
            {roleLabel(r.name)}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
    </div>
  );
}

function CreateUserDialog({ roles }: { roles: { name: string }[] }) {
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
  const { data: stores = [] } = useQuery<{ id: string; name: string; code?: string }[]>({
    queryKey: ['stores'],
    queryFn: async () => (await api.get('/stores')).data,
    enabled: open,
  });

  // Once roles load, make sure the selected role is actually one that exists.
  useEffect(() => {
    if (roles.length && !roles.some((r) => r.name === form.role)) {
      setForm((f) => ({ ...f, role: roles[0].name }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roles]);

  const create = useMutation({
    mutationFn: async () =>
      (
        await api.post('/users', {
          ...form,
          store: isSuperAdmin ? undefined : form.store,
        })
      ).data,
    onSuccess: () => {
      toast.success(`${form.fullName} added as ${roleLabel(form.role)}`);
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
          <div className="space-y-1.5">
            <Label htmlFor="new-user-role">Role</Label>
            <RoleSelect
              id="new-user-role"
              value={form.role}
              onChange={(role) => setForm({ ...form, role })}
              roles={roles}
            />
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
                This user will only see and act on this store's data.
              </p>
            </div>
          )}
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

function UsersCard() {
  const qc = useQueryClient();
  const { t } = useLanguage();
  const currentUser = useAuthStore((s) => s.user);
  const canEdit = grantsPermission(currentUser?.permissions, 'users:update');
  const onError = (e: any) => toast.error(e?.response?.data?.message ?? 'Action failed');
  const invalidate = () => qc.invalidateQueries({ queryKey: ['users'] });

  const { data: users = [] } = useQuery<ManagedUser[]>({
    queryKey: ['users'],
    queryFn: async () => (await api.get('/users')).data,
  });
  // Live role list (built-in + custom roles added on the Roles page) for the assign-role dropdown.
  const { data: roles = [] } = useQuery<{ name: string }[]>({
    queryKey: ['roles'],
    queryFn: async () => (await api.get('/roles')).data,
  });
  // Only one super admin is allowed system-wide — once one exists, don't
  // offer it as a role for new users (the backend rejects it anyway).
  const hasSuperAdmin = users.some((u) => u.role === 'SUPER_ADMIN');
  const assignableRoles = hasSuperAdmin
    ? roles.filter((r) => r.name.toUpperCase() !== 'SUPER_ADMIN')
    : roles;

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
  const remove = (u: ManagedUser) => removeMut.mutate(u.id);

  return (
    <Card className="overflow-hidden">
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <div className="space-y-1.5">
          <CardTitle>Users</CardTitle>
          <CardDescription>Create users and assign each one a role.</CardDescription>
        </div>
        <CreateUserDialog roles={assignableRoles} />
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
                          roles={roles}
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
                      {u.storeName ?? (u.role === 'SUPER_ADMIN' ? 'All stores' : '—')}
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

interface RolePermissions {
  id: string;
  name: string; // backend role name (lowercase)
  permissions: string[];
}

function ModuleAccessCard() {
  const qc = useQueryClient();
  const { data: roles = [], isLoading } = useQuery<RolePermissions[]>({
    queryKey: ['roles'],
    queryFn: async () => (await api.get('/roles')).data,
  });

  // Every role gets a column — built-in and custom alike — except Super
  // Admin, which is locked server-side and always has full access.
  const configurableRoles = roles.filter((r) => r.name.toUpperCase() !== 'SUPER_ADMIN');

  const update = useMutation({
    mutationFn: async ({ id, permissions }: { id: string; permissions: string[] }) =>
      (await api.patch(`/roles/${id}`, { permissions })).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['roles'] }),
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'Could not update access'),
  });

  const toggle = (rec: RolePermissions, moduleKey: string) => {
    const perm = MODULE_PERMISSION[moduleKey];
    if (!perm) return;
    const permissions = grantsPermission(rec.permissions, perm)
      ? rec.permissions.filter((p) => p !== perm)
      : [...rec.permissions, perm];
    update.mutate({ id: rec.id, permissions });
  };

  return (
    <Card className="overflow-hidden">
      <CardHeader className="space-y-1.5">
        <CardTitle>Module Access</CardTitle>
        <CardDescription>
          Controls each role's real permissions on the server — a checked box grants that module's
          governing permission. Super Admin always has full access. (Dashboard, Reports and Day Book
          share a permission, so they toggle together.)
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
                configurableRoles.map((rec) => (
                  <tr key={rec.id} className="border-b last:border-0 hover:bg-muted/30">
                    <td className="px-4 py-3 font-medium">{roleLabel(rec.name)}</td>
                    {CONFIGURABLE_MODULES.map((m) => {
                      const enabled = grantsPermission(rec.permissions, MODULE_PERMISSION[m.key]);
                      return (
                        <td key={m.key} className="px-3 py-3 text-center">
                          <button
                            type="button"
                            role="checkbox"
                            aria-checked={enabled}
                            aria-label={`${m.label} for ${roleLabel(rec.name)}`}
                            disabled={update.isPending}
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
                ))}
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
export function PermissionsPage() {
  return (
    <div className="space-y-4">
      <UsersCard />
      <ModuleAccessCard />
    </div>
  );
}
