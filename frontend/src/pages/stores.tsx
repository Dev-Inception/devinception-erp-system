import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Loader2, Building2, Star, Check, Pencil, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent } from '@/components/ui/card';
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
import { api } from '@/lib/api';
import { useAuthStore } from '@/store/auth';
import { grantsPermission } from '@/lib/modules';
import type { WarehouseRow } from '@/components/layout/warehouse-switcher';
import { useLanguage } from '@/components/language-provider';

interface StoreRow {
  id: string;
  name: string;
  code: string;
  address: string;
  warehouseIds: string[];
  warehouseNames: string[];
  isDefault: boolean;
  isActive: boolean;
}

/** Create (no `store`) or edit (with `store`) a store. */
function StoreDialog({ store, trigger }: { store?: StoreRow; trigger: React.ReactNode }) {
  const qc = useQueryClient();
  const { t } = useLanguage();
  const editing = !!store;
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    name: '',
    code: '',
    address: '',
    warehouseIds: [] as string[],
    isDefault: false,
  });

  const { data: warehouses = [] } = useQuery<WarehouseRow[]>({
    queryKey: ['warehouses'],
    queryFn: async () => (await api.get('/warehouses')).data,
  });

  useEffect(() => {
    if (open) {
      setForm({
        name: store?.name ?? '',
        code: store?.code ?? '',
        address: store?.address ?? '',
        warehouseIds: store?.warehouseIds ?? [],
        isDefault: false,
      });
    }
  }, [open, store]);

  const toggleWarehouse = (id: string) =>
    setForm((f) => ({
      ...f,
      warehouseIds: f.warehouseIds.includes(id)
        ? f.warehouseIds.filter((w) => w !== id)
        : [...f.warehouseIds, id],
    }));

  const save = useMutation({
    mutationFn: async () =>
      editing
        ? (
            await api.patch(`/stores/${store!.id}`, {
              name: form.name,
              code: form.code,
              address: form.address,
              warehouseIds: form.warehouseIds,
            })
          ).data
        : (await api.post('/stores', form)).data,
    onSuccess: () => {
      toast.success(editing ? 'Store updated' : 'Store created');
      qc.invalidateQueries({ queryKey: ['stores'] });
      setOpen(false);
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'Could not save store'),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{editing ? 'Edit Store' : 'New Store'}</DialogTitle>
          <DialogDescription>
            {editing
              ? 'Update this storefront’s details and which warehouses it groups.'
              : 'A storefront groups one or more warehouses — pick which of your warehouses belong to it.'}
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
              placeholder="e.g. Downtown Store"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Code</Label>
            <Input
              value={form.code}
              onChange={(e) => setForm({ ...form, code: e.target.value })}
              placeholder="e.g. LHR-01"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Address</Label>
            <Input
              value={form.address}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Warehouses</Label>
            <div className="max-h-40 space-y-1.5 overflow-y-auto rounded-md border p-3">
              {warehouses.length === 0 && (
                <p className="text-sm text-muted-foreground">No warehouses yet.</p>
              )}
              {warehouses.map((w) => (
                <label key={w.id} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={form.warehouseIds.includes(w.id)}
                    onChange={() => toggleWarehouse(w.id)}
                  />
                  {w.name}
                  {w.location ? ` — ${w.location}` : ''}
                </label>
              ))}
            </div>
          </div>
          {!editing && (
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.isDefault}
                onChange={(e) => setForm({ ...form, isDefault: e.target.checked })}
              />
              Make this the default store
            </label>
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

export function StoresPage() {
  const qc = useQueryClient();
  const { t } = useLanguage();
  const perms = useAuthStore((s) => s.user?.permissions);
  const canManage = grantsPermission(perms, 'stores:manage');

  const { data: stores = [], isLoading } = useQuery<StoreRow[]>({
    queryKey: ['stores'],
    queryFn: async () => (await api.get('/stores')).data,
  });

  const setDefault = useMutation({
    mutationFn: async (id: string) => (await api.post(`/stores/${id}/set-default`)).data,
    onSuccess: () => {
      toast.success('Default store updated');
      qc.invalidateQueries({ queryKey: ['stores'] });
    },
  });

  const del = useMutation({
    mutationFn: async (id: string) => (await api.delete(`/stores/${id}`)).data,
    onSuccess: () => {
      toast.success('Store deleted');
      qc.invalidateQueries({ queryKey: ['stores'] });
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'Could not delete store'),
  });

  const remove = (s: StoreRow) => {
    if (window.confirm(`Delete store “${s.name}”? This cannot be undone.`)) del.mutate(s.id);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {stores.length} store(s) — each groups one or more warehouses.
        </p>
        {canManage && (
          <StoreDialog
            trigger={
              <Button>
                <Plus className="h-4 w-4" /> {t('Add Store')}
              </Button>
            }
          />
        )}
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {stores.map((s) => (
            <Card key={s.id}>
              <CardContent className="space-y-3 p-5">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <Building2 className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="font-semibold">
                        {s.name}
                        {s.code ? ` (${s.code})` : ''}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {s.address || 'No address set'}
                      </p>
                    </div>
                  </div>
                  {s.isDefault && (
                    <span className="flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-500">
                      <Star className="h-3 w-3 fill-current" /> Default
                    </span>
                  )}
                </div>

                <div className="border-t pt-3 text-sm">
                  <p className="text-xs text-muted-foreground">Warehouses</p>
                  <p className="font-medium">
                    {s.warehouseNames.length > 0 ? s.warehouseNames.join(', ') : 'None assigned'}
                  </p>
                </div>

                {canManage && (
                  <div className="flex gap-2">
                    {!s.isDefault && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1"
                        disabled={setDefault.isPending}
                        onClick={() => setDefault.mutate(s.id)}
                      >
                        <Check className="h-4 w-4" /> {t('Set default')}
                      </Button>
                    )}
                    <StoreDialog
                      store={s}
                      trigger={
                        <Button variant="outline" size="sm" className={s.isDefault ? 'flex-1' : ''}>
                          <Pencil className="h-4 w-4" /> {t('Edit')}
                        </Button>
                      }
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      title={t('Delete')}
                      disabled={del.isPending || s.isDefault}
                      onClick={() => remove(s)}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
