import { useEffect, useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Loader2, Pencil, Trash2, Wrench, Search } from 'lucide-react';
import { toast } from 'sonner';
import { useConfirmDelete } from '@/components/confirm-provider';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
import { useStorefrontFilter } from '@/store/storefront';
import { grantsPermission } from '@/lib/modules';
import { Pagination } from '@/components/ui/pagination';
import { useLanguage } from '@/components/language-provider';

interface LabourService {
  id: string;
  name: string;
  description?: string;
}
const SEARCH_FETCH_LIMIT = 200;
const PAGE_SIZE = 20;

/** Create (no `editing`) or edit (with `editing`) a labour service. */
function LabourServiceDialog({
  open,
  onOpenChange,
  editing,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  editing: LabourService | null;
}) {
  const qc = useQueryClient();
  const { t } = useLanguage();
  const isEditing = !!editing;
  const [form, setForm] = useState({ name: '', description: '', store: '' });

  const { data: stores = [] } = useQuery<{ id: string; name: string; code?: string }[]>({
    queryKey: ['stores'],
    queryFn: async () => (await api.get('/stores')).data,
    enabled: open && !isEditing,
  });

  useEffect(() => {
    if (open) {
      setForm({
        name: editing?.name ?? '',
        description: editing?.description ?? '',
        store: '',
      });
    }
  }, [open, editing]);

  // Default to the only store when there's just one — same convenience the
  // store-scoped backend already applies server-side.
  useEffect(() => {
    if (!isEditing && stores.length === 1 && !form.store) {
      setForm((f) => ({ ...f, store: stores[0].id }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stores]);

  const save = useMutation({
    mutationFn: async () =>
      isEditing
        ? (
            await api.patch(`/labour-services/${editing!.id}`, {
              name: form.name,
              description: form.description,
            })
          ).data
        : (await api.post('/labour-services', form)).data,
    onSuccess: () => {
      toast.success(isEditing ? 'Labour service updated' : 'Labour service created');
      qc.invalidateQueries({ queryKey: ['labour-services'] });
      onOpenChange(false);
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'Could not save labour service'),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {isEditing ? t('Edit Labour Service') : t('New Labour Service')}
          </DialogTitle>
          <DialogDescription>
            {isEditing
              ? 'Update this labour service.'
              : 'Add a billable labour service (e.g. Ceiling, Panel, UV Sheet, Wooden floor).'}
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
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="e.g. Ceiling"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Description</Label>
            <Input
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </div>
          {!isEditing && (
            <div className="space-y-1.5">
              <Label htmlFor="new-labour-service-store">Store *</Label>
              <select
                id="new-labour-service-store"
                required
                value={form.store}
                onChange={(e) => setForm({ ...form, store: e.target.value })}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
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
            </div>
          )}
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

export function LabourServicesPage() {
  const qc = useQueryClient();
  const { t } = useLanguage();
  const perms = useAuthStore((s) => s.user?.permissions);
  // Labour service create/update/delete all require inventory:manage on the backend.
  const canManage = grantsPermission(perms, 'inventory:manage');
  const storefront = useStorefrontFilter();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  const q = search.trim().toLowerCase();
  const isSearching = q.length > 0;
  const fetchPage = isSearching ? 1 : page;
  const fetchLimit = isSearching ? SEARCH_FETCH_LIMIT : PAGE_SIZE;

  const { data: labourServices = [], isLoading } = useQuery<LabourService[]>({
    queryKey: ['labour-services', storefront.store],
    queryFn: async () => (await api.get('/labour-services', { params: storefront })).data,
  });

  const filtered = useMemo(
    () =>
      isSearching
        ? labourServices.filter(
            (s) =>
              s.name.toLowerCase().includes(q) || (s.description ?? '').toLowerCase().includes(q),
          )
        : labourServices,
    [labourServices, isSearching, q],
  );
  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const pageItems = isSearching
    ? filtered.slice(0, fetchLimit)
    : filtered.slice((fetchPage - 1) * PAGE_SIZE, fetchPage * PAGE_SIZE);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<LabourService | null>(null);

  const del = useMutation({
    mutationFn: async (id: string) => (await api.delete(`/labour-services/${id}`)).data,
    onSuccess: () => {
      toast.success('Labour service deleted');
      qc.invalidateQueries({ queryKey: ['labour-services'] });
    },
    onError: (e: any) =>
      toast.error(e?.response?.data?.message ?? 'Could not delete labour service'),
  });

  const confirmDelete = useConfirmDelete();
  const remove = async (s: LabourService) => {
    if (await confirmDelete(`labour service "${s.name}"`)) del.mutate(s.id);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-end gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs">{t('Search')}</Label>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t('Search labour services…')}
                className="w-72 pl-8"
              />
            </div>
          </div>
          <p className="pb-2 text-sm text-muted-foreground">{total} labour service(s)</p>
        </div>
        {canManage && (
          <Button
            onClick={() => {
              setEditing(null);
              setDialogOpen(true);
            }}
          >
            <Plus className="h-4 w-4" /> {t('Add Labour Service')}
          </Button>
        )}
      </div>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
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
                  <td colSpan={3} className="px-4 py-10 text-center text-muted-foreground">
                    Loading…
                  </td>
                </tr>
              )}
              {!isLoading &&
                pageItems.map((s) => (
                  <tr key={s.id} className="border-b last:border-0 hover:bg-muted/30">
                    <td className="px-4 py-3 font-medium">
                      <div className="flex items-center gap-2">
                        <Wrench className="h-4 w-4 text-muted-foreground" />
                        {s.name}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{s.description || '—'}</td>
                    {canManage && (
                      <td className="px-4 py-3 text-right">
                        <div className="flex justify-end gap-1">
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8"
                            title={t('Edit')}
                            onClick={() => {
                              setEditing(s);
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
                            onClick={() => remove(s)}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              {!isLoading && pageItems.length === 0 && (
                <tr>
                  <td colSpan={3} className="px-4 py-10 text-center text-muted-foreground">
                    {isSearching
                      ? 'No labour services match your search.'
                      : 'No labour services yet.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
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
        <LabourServiceDialog
          key={editing?.id ?? 'new'}
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          editing={editing}
        />
      )}
    </div>
  );
}
