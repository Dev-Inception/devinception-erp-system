import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Plus,
  Loader2,
  Warehouse as WarehouseIcon,
  Star,
  Check,
  Pencil,
  Trash2,
} from 'lucide-react';
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
import { formatCurrency } from '@/lib/utils';
import { useAuthStore } from '@/store/auth';
import { grantsPermission } from '@/lib/modules';
import type { WarehouseRow } from '@/components/layout/warehouse-switcher';

/** Create (no `warehouse`) or edit (with `warehouse`) a warehouse. */
function WarehouseDialog({
  warehouse,
  trigger,
}: {
  warehouse?: WarehouseRow;
  trigger: React.ReactNode;
}) {
  const qc = useQueryClient();
  const editing = !!warehouse;
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: '', location: '', isDefault: false });

  useEffect(() => {
    if (open) {
      setForm({
        name: warehouse?.name ?? '',
        location: warehouse?.location ?? '',
        isDefault: false,
      });
    }
  }, [open, warehouse]);

  const save = useMutation({
    mutationFn: async () =>
      editing
        ? (
            await api.patch(`/warehouses/${warehouse!.id}`, {
              name: form.name,
              location: form.location,
            })
          ).data
        : (await api.post('/warehouses', form)).data,
    onSuccess: () => {
      toast.success(editing ? 'Warehouse updated' : 'Warehouse created');
      qc.invalidateQueries({ queryKey: ['warehouses'] });
      setOpen(false);
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'Could not save warehouse'),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{editing ? 'Edit Warehouse' : 'New Warehouse'}</DialogTitle>
          <DialogDescription>
            {editing
              ? 'Update this warehouse’s name or location.'
              : 'Each warehouse keeps its own inventory.'}
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
              placeholder="e.g. Warehouse B / Downtown Branch"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Location</Label>
            <Input
              value={form.location}
              onChange={(e) => setForm({ ...form, location: e.target.value })}
            />
          </div>
          {!editing && (
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.isDefault}
                onChange={(e) => setForm({ ...form, isDefault: e.target.checked })}
              />
              Make this the default warehouse
            </label>
          )}
          <div className="flex justify-end gap-2 pt-1">
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" disabled={save.isPending}>
              {save.isPending && <Loader2 className="h-4 w-4 animate-spin" />}Save
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function WarehousesPage() {
  const qc = useQueryClient();
  const perms = useAuthStore((s) => s.user?.permissions);
  // Warehouse create/update/delete all require inventory:manage on the backend.
  const canManage = grantsPermission(perms, 'inventory:manage');

  const { data: warehouses = [], isLoading } = useQuery<WarehouseRow[]>({
    queryKey: ['warehouses'],
    queryFn: async () => (await api.get('/warehouses')).data,
  });

  const setDefault = useMutation({
    mutationFn: async (id: string) => (await api.post(`/warehouses/${id}/set-default`)).data,
    onSuccess: () => {
      toast.success('Default warehouse updated');
      qc.invalidateQueries({ queryKey: ['warehouses'] });
    },
  });

  const del = useMutation({
    mutationFn: async (id: string) => (await api.delete(`/warehouses/${id}`)).data,
    onSuccess: () => {
      toast.success('Warehouse deleted');
      qc.invalidateQueries({ queryKey: ['warehouses'] });
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'Could not delete warehouse'),
  });

  const remove = (w: WarehouseRow) => {
    if (window.confirm(`Delete warehouse “${w.name}”? This cannot be undone.`)) del.mutate(w.id);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {warehouses.length} warehouse(s) — each keeps its own inventory.
        </p>
        {canManage && (
          <WarehouseDialog
            trigger={
              <Button>
                <Plus className="h-4 w-4" /> Add Warehouse
              </Button>
            }
          />
        )}
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {warehouses.map((w) => (
            <Card key={w.id}>
              <CardContent className="space-y-3 p-5">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <WarehouseIcon className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="font-semibold">{w.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {w.location || 'No location set'}
                      </p>
                    </div>
                  </div>
                  {w.isDefault && (
                    <span className="flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-500">
                      <Star className="h-3 w-3 fill-current" /> Default
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-2 border-t pt-3 text-sm">
                  <div>
                    <p className="text-xs text-muted-foreground">Items in stock</p>
                    <p className="font-semibold">{w.itemCount}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Stock value</p>
                    <p className="font-semibold">{formatCurrency(w.stockValue)}</p>
                  </div>
                </div>

                {canManage && (
                  <div className="flex gap-2">
                    {!w.isDefault && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1"
                        disabled={setDefault.isPending}
                        onClick={() => setDefault.mutate(w.id)}
                      >
                        <Check className="h-4 w-4" /> Set default
                      </Button>
                    )}
                    <WarehouseDialog
                      warehouse={w}
                      trigger={
                        <Button variant="outline" size="sm" className={w.isDefault ? 'flex-1' : ''}>
                          <Pencil className="h-4 w-4" /> Edit
                        </Button>
                      }
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      title="Delete"
                      disabled={del.isPending || w.isDefault}
                      onClick={() => remove(w)}
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
