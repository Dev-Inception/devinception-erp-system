import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Search, Loader2, Pencil, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
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
  DialogTrigger,
  DialogClose,
} from '@/components/ui/dialog';
import { api } from '@/lib/api';
import { formatCurrency } from '@/lib/utils';
import { useAuthStore } from '@/store/auth';
import { grantsPermission } from '@/lib/modules';

interface Vendor {
  id: string;
  name: string;
  phone?: string;
  email?: string;
  address?: string;
  ntn?: string;
  outstanding: number;
}

const emptyForm = { name: '', phone: '', email: '', address: '', ntn: '' };

/** Create (no `vendor`) or edit (with `vendor`) a vendor. */
function VendorDialog({ vendor, trigger }: { vendor?: Vendor; trigger: React.ReactNode }) {
  const qc = useQueryClient();
  const editing = !!vendor;
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);

  // Reset the form to the vendor's values (or blank) each time the dialog opens.
  useEffect(() => {
    if (open) {
      setForm(
        vendor
          ? {
              name: vendor.name,
              phone: vendor.phone ?? '',
              email: vendor.email ?? '',
              address: vendor.address ?? '',
              ntn: vendor.ntn ?? '',
            }
          : emptyForm,
      );
    }
  }, [open, vendor]);

  const save = useMutation({
    mutationFn: async () =>
      editing
        ? (await api.patch(`/vendors/${vendor!.id}`, form)).data
        : (await api.post('/vendors', form)).data,
    onSuccess: () => {
      toast.success(editing ? 'Vendor updated' : 'Vendor created');
      qc.invalidateQueries({ queryKey: ['vendors'] });
      setOpen(false);
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'Could not save vendor'),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{editing ? 'Edit Vendor' : 'New Vendor'}</DialogTitle>
          <DialogDescription>
            {editing
              ? 'Update this supplier’s details.'
              : 'Add a supplier you purchase goods from.'}
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
            <Label htmlFor="v-name">Name *</Label>
            <Input
              id="v-name"
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="v-phone">Phone</Label>
              <Input
                id="v-phone"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="v-ntn">NTN</Label>
              <Input
                id="v-ntn"
                value={form.ntn}
                onChange={(e) => setForm({ ...form, ntn: e.target.value })}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="v-email">Email</Label>
            <Input
              id="v-email"
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="v-addr">Address</Label>
            <Input
              id="v-addr"
              value={form.address}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" disabled={save.isPending}>
              {save.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Save
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function VendorsPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const perms = useAuthStore((s) => s.user?.permissions);
  const canUpdate = grantsPermission(perms, 'vendors:update');
  const canDelete = grantsPermission(perms, 'vendors:delete');
  const showActions = canUpdate || canDelete;

  const { data: vendors = [], isLoading } = useQuery<Vendor[]>({
    queryKey: ['vendors', search],
    queryFn: async () => (await api.get('/vendors', { params: { search } })).data,
  });

  const del = useMutation({
    mutationFn: async (id: string) => (await api.delete(`/vendors/${id}`)).data,
    onSuccess: () => {
      toast.success('Vendor deleted');
      qc.invalidateQueries({ queryKey: ['vendors'] });
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'Could not delete vendor'),
  });

  const remove = (v: Vendor) => {
    if (window.confirm(`Delete vendor “${v.name}”? This cannot be undone.`)) del.mutate(v.id);
  };

  const colSpan = showActions ? 6 : 5;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search vendors…"
            className="w-72 pl-8"
          />
        </div>
        <VendorDialog
          trigger={
            <Button>
              <Plus className="h-4 w-4" /> Add Vendor
            </Button>
          }
        />
      </div>

      <Card className="overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th className="px-4 py-3 font-medium">Vendor</th>
              <th className="px-4 py-3 font-medium">Phone</th>
              <th className="px-4 py-3 font-medium">Email</th>
              <th className="px-4 py-3 font-medium">NTN</th>
              <th className="px-4 py-3 text-right font-medium">Outstanding</th>
              {showActions && <th className="px-4 py-3 text-right font-medium">Actions</th>}
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={colSpan} className="px-4 py-10 text-center text-muted-foreground">
                  Loading…
                </td>
              </tr>
            )}
            {!isLoading &&
              vendors.map((v) => (
                <tr key={v.id} className="border-b last:border-0 hover:bg-muted/30">
                  <td className="px-4 py-3 font-medium">{v.name}</td>
                  <td className="px-4 py-3 text-muted-foreground">{v.phone ?? '—'}</td>
                  <td className="px-4 py-3 text-muted-foreground">{v.email ?? '—'}</td>
                  <td className="px-4 py-3 text-muted-foreground">{v.ntn ?? '—'}</td>
                  <td className="px-4 py-3 text-right font-medium">
                    {formatCurrency(v.outstanding)}
                  </td>
                  {showActions && (
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1">
                        {canUpdate && (
                          <VendorDialog
                            vendor={v}
                            trigger={
                              <Button variant="ghost" size="icon" className="h-8 w-8" title="Edit">
                                <Pencil className="h-4 w-4" />
                              </Button>
                            }
                          />
                        )}
                        {canDelete && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            title="Delete"
                            disabled={del.isPending}
                            onClick={() => remove(v)}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            {!isLoading && vendors.length === 0 && (
              <tr>
                <td colSpan={colSpan} className="px-4 py-10 text-center text-muted-foreground">
                  No vendors yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
