import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Loader2, Pencil, Trash2, HardHat } from 'lucide-react';
import { toast } from 'sonner';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Pagination } from '@/components/ui/pagination';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogClose,
} from '@/components/ui/dialog';
import { api } from '@/lib/api';
import { useAuthStore } from '@/store/auth';
import { useLanguage } from '@/components/language-provider';

interface Role {
  id: string;
  name: string;
  description: string;
}
const SEARCH_FETCH_LIMIT = 200;
const PAGE_SIZE = 20;

function RoleDialog({
  open,
  onOpenChange,
  editing,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  editing: Role | null;
}) {
  const qc = useQueryClient();
  const { t } = useLanguage();
  const isEditing = !!editing;
  const [form, setForm] = useState({ name: '', description: '' });
  useEffect(() => {
    if (open) setForm({ name: editing?.name ?? '', description: editing?.description ?? '' });
  }, [open, editing]);

  const save = useMutation({
    mutationFn: async () =>
      isEditing
        ? (await api.patch(`/roles/${editing!.id}`, { description: form.description })).data
        : (await api.post('/roles', form)).data,
    onSuccess: () => {
      toast.success(isEditing ? 'Role updated' : 'Role created');
      qc.invalidateQueries({ queryKey: ['roles'] });
      onOpenChange(false);
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'Could not save Role'),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Edit Role' : 'New Role'}</DialogTitle>
          <DialogDescription>
            {isEditing ? 'Update this Role’s details.' : 'Add a Role.'}
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
            <Label>Name *</Label>
            <Input
              required
              disabled={isEditing}
              minLength={2}
              maxLength={100}
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="e.g. Store Manager"
            />
            {isEditing && (
              <p className="text-xs text-muted-foreground">
                A role's name can't be changed after creation.
              </p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label>Description</Label>
            <Input
              maxLength={200}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="What this role is for"
            />
          </div>

          <div className="flex justify-end gap-2 pt-1">
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

export function RolePage() {
  const qc = useQueryClient();
  const { t } = useLanguage();
  const role = useAuthStore((s) => s.user?.role);
  const canManage = role === 'SUPER_ADMIN';
  const [search, setSearch] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);

  const q = search.trim().toLowerCase();
  const isSearching = q.length > 0;
  const fetchPage = isSearching ? 1 : page;
  const fetchLimit = isSearching ? SEARCH_FETCH_LIMIT : PAGE_SIZE;

  const { data: roles = [], isLoading } = useQuery<Role[]>({
    queryKey: ['roles'],
    queryFn: async () => (await api.get('/roles')).data,
  });

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Role | null>(null);
  const total = roles.length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const del = useMutation({
    mutationFn: async (id: string) => (await api.delete(`/roles/${id}`)).data,
    onSuccess: () => {
      toast.success('Role deleted');
      qc.invalidateQueries({ queryKey: ['roles'] });
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'Could not delete Role'),
  });

  const remove = (l: Role) => {
    if (window.confirm(`Delete role "${l.name}"? This cannot be undone.`)) del.mutate(l.id);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{roles.length} role(s)</p>
        {canManage && (
          <Button
            onClick={() => {
              setEditing(null);
              setDialogOpen(true);
            }}
          >
            <Plus className="h-4 w-4" /> {t('Add Role')}
          </Button>
        )}
      </div>

      <Card className="overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th className="px-4 py-3 font-medium">{t('Name')}</th>
              <th className="px-4 py-3 font-medium">{t('Description')}</th>
              {canManage && <th className="px-4 py-3 text-right font-medium">{t('Actions')}</th>}
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td
                  colSpan={canManage ? 3 : 2}
                  className="px-4 py-10 text-center text-muted-foreground"
                >
                  Loading…
                </td>
              </tr>
            )}
            {!isLoading &&
              roles.map((l) => (
                <tr key={l.id} className="border-b last:border-0 hover:bg-muted/30">
                  <td className="px-4 py-3 font-medium">
                    <div className="flex items-center gap-2">
                      <HardHat className="h-4 w-4 text-muted-foreground" />
                      {l.name}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{l.description}</td>
                  {canManage && (
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8"
                          title={t('Edit')}
                          onClick={() => {
                            setEditing(l);
                            setDialogOpen(true);
                          }}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8"
                          title={t('Delete')}
                          disabled={del.isPending}
                          onClick={() => remove(l)}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            {!isLoading && roles.length === 0 && (
              <tr>
                <td
                  colSpan={canManage ? 3 : 2}
                  className="px-4 py-10 text-center text-muted-foreground"
                >
                  No role records yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
        {!isSearching && (
          <Pagination
            page={page}
            totalPages={totalPages}
            total={total}
            pageSize={PAGE_SIZE}
            onPageChange={setPage}
            className="border-t"
          />
        )}
      </Card>

      {dialogOpen && (
        <RoleDialog
          key={editing?.id ?? 'new'}
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          editing={editing}
        />
      )}
    </div>
  );
}
