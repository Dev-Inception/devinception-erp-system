import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, ShieldAlert, RotateCcw, Check, UserPlus } from 'lucide-react';
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
import { usePermissionsStore, type ManagedUser } from '@/store/permissions';
import { ROLES, CONFIGURABLE_ROLES, CONFIGURABLE_MODULES } from '@/lib/modules';

const ROLE_LABELS: Record<Role, string> = {
  SUPER_ADMIN: 'Super Admin',
  ADMIN: 'Admin',
  MANAGER: 'Manager',
  CASHIER: 'Cashier',
  ACCOUNTANT: 'Accountant',
};

/** Native select styled to match the Input component. */
function RoleSelect({
  value,
  onChange,
  id,
}: {
  value: Role;
  onChange: (role: Role) => void;
  id?: string;
}) {
  return (
    <select
      id={id}
      value={value}
      onChange={(e) => onChange(e.target.value as Role)}
      className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:border-input"
    >
      {ROLES.map((r) => (
        <option key={r} value={r}>
          {ROLE_LABELS[r]}
        </option>
      ))}
    </select>
  );
}

function CreateUserDialog() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<{
    fullName: string;
    email: string;
    password: string;
    role: Role;
  }>({
    fullName: '',
    email: '',
    password: '',
    role: 'CASHIER',
  });

  const create = useMutation({
    mutationFn: async () => (await api.post('/users', form)).data,
    onSuccess: () => {
      toast.success(`${form.fullName} added as ${ROLE_LABELS[form.role]}`);
      qc.invalidateQueries({ queryKey: ['users'] });
      setForm({ fullName: '', email: '', password: '', role: 'CASHIER' });
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
          <Plus className="h-4 w-4" /> Add User
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
            <Input
              required
              type="password"
              minLength={8}
              placeholder="At least 8 characters"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="new-user-role">Role</Label>
            <RoleSelect
              id="new-user-role"
              value={form.role}
              onChange={(role) => setForm({ ...form, role })}
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" disabled={create.isPending}>
              <UserPlus className="h-4 w-4" /> Create User
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function UsersCard() {
  const qc = useQueryClient();
  const currentUser = useAuthStore((s) => s.user);
  const onError = (e: any) => toast.error(e?.response?.data?.message ?? 'Action failed');
  const invalidate = () => qc.invalidateQueries({ queryKey: ['users'] });

  const { data: users = [] } = useQuery<ManagedUser[]>({
    queryKey: ['users'],
    queryFn: async () => (await api.get('/users')).data,
  });

  const setRole = useMutation({
    mutationFn: async ({ id, role }: { id: string; role: Role }) =>
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

  const updateUser = (id: string, patch: { role?: Role; active?: boolean }) => {
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
        <CreateUserDialog />
      </CardHeader>
      <CardContent className="px-0 pb-0">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th className="px-4 py-3 font-medium">User</th>
              <th className="px-4 py-3 font-medium">Email</th>
              <th className="px-4 py-3 font-medium">Role</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => {
              const isSelf = currentUser?.email === u.email;
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
                      <RoleSelect value={u.role} onChange={(role) => updateUser(u.id, { role })} />
                    </div>
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
                  <td className="px-4 py-3 text-right">
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Remove ${u.fullName}`}
                      disabled={isSelf}
                      title={isSelf ? 'You cannot remove your own account' : 'Remove user'}
                      onClick={() => remove(u)}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </td>
                </tr>
              );
            })}
            {users.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-muted-foreground">
                  No users yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}

function ModuleAccessCard() {
  const access = usePermissionsStore((s) => s.access);
  const toggleModule = usePermissionsStore((s) => s.toggleModule);
  const resetAccess = usePermissionsStore((s) => s.resetAccess);

  return (
    <Card className="overflow-hidden">
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <div className="space-y-1.5">
          <CardTitle>Module Access</CardTitle>
          <CardDescription>
            Choose which modules appear in the sidebar for each role. Super Admin always sees
            everything.
          </CardDescription>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            resetAccess();
            toast.success('Module access reset to defaults');
          }}
        >
          <RotateCcw className="h-4 w-4" /> Reset to defaults
        </Button>
      </CardHeader>
      <CardContent className="px-0 pb-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-3 font-medium">Module</th>
                {CONFIGURABLE_ROLES.map((role) => (
                  <th key={role} className="px-4 py-3 text-center font-medium">
                    {ROLE_LABELS[role]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {CONFIGURABLE_MODULES.map((m) => (
                <tr key={m.key} className="border-b last:border-0 hover:bg-muted/30">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <m.icon className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <p className="font-medium">{m.label}</p>
                        <p className="text-xs text-muted-foreground">{m.section}</p>
                      </div>
                    </div>
                  </td>
                  {CONFIGURABLE_ROLES.map((role) => {
                    const enabled = (access[role] ?? []).includes(m.key);
                    return (
                      <td key={role} className="px-4 py-3 text-center">
                        <button
                          type="button"
                          role="checkbox"
                          aria-checked={enabled}
                          aria-label={`${m.label} for ${ROLE_LABELS[role]}`}
                          onClick={() => toggleModule(role, m.key)}
                          className={cn(
                            'inline-flex h-5 w-5 items-center justify-center rounded border transition-colors',
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
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

export function PermissionsPage() {
  const role = useAuthStore((s) => s.user?.role);

  if (role !== 'SUPER_ADMIN') {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center gap-3 py-20 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
            <ShieldAlert className="h-6 w-6" />
          </div>
          <h2 className="text-lg font-semibold">Super Admin only</h2>
          <p className="max-w-md text-sm text-muted-foreground">
            You don't have permission to manage users and module access.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <UsersCard />
      <ModuleAccessCard />
    </div>
  );
}
