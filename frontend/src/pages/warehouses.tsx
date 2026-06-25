import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Loader2, Warehouse as WarehouseIcon, Star, Check } from 'lucide-react';
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
  DialogTrigger,
  DialogClose,
} from '@/components/ui/dialog';
import { api } from '@/lib/api';
import { formatCurrency } from '@/lib/utils';
import type { WarehouseRow } from '@/components/layout/warehouse-switcher';

function CreateWarehouseDialog() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: '', location: '', isDefault: false });

  const create = useMutation({
    mutationFn: async () => (await api.post('/warehouses', form)).data,
    onSuccess: () => {
      toast.success('Warehouse created');
      qc.invalidateQueries({ queryKey: ['warehouses'] });
      setForm({ name: '', location: '', isDefault: false });
      setOpen(false);
    },
    onError: () => toast.error('Could not create warehouse'),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="h-4 w-4" /> Add Warehouse
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>New Warehouse</DialogTitle>
        </DialogHeader>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            create.mutate();
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
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.isDefault}
              onChange={(e) => setForm({ ...form, isDefault: e.target.checked })}
            />
            Make this the default warehouse
          </label>
          <div className="flex justify-end gap-2 pt-1">
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" disabled={create.isPending}>
              {create.isPending && <Loader2 className="h-4 w-4 animate-spin" />}Save
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function WarehousesPage() {
  const qc = useQueryClient();
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

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {warehouses.length} warehouse(s) — each keeps its own inventory.
        </p>
        <CreateWarehouseDialog />
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

                {!w.isDefault && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full"
                    disabled={setDefault.isPending}
                    onClick={() => setDefault.mutate(w.id)}
                  >
                    <Check className="h-4 w-4" /> Set as default
                  </Button>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
