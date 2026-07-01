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

interface Customer {
  id: string;
  name: string;
  phone?: string;
  email?: string;
  address?: string;
  creditLimit: string | number;
  outstanding: number;
}

const emptyForm = { name: '', phone: '', email: '', address: '', creditLimit: 0 };

/** Create (no `customer`) or edit (with `customer`) a customer. */
function CustomerDialog({ customer, trigger }: { customer?: Customer; trigger: React.ReactNode }) {
  const qc = useQueryClient();
  const editing = !!customer;
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);

  // Reset the form to the customer's values (or blank) each time it opens.
  useEffect(() => {
    if (open) {
      setForm(
        customer
          ? {
              name: customer.name,
              phone: customer.phone ?? '',
              email: customer.email ?? '',
              address: customer.address ?? '',
              creditLimit: Number(customer.creditLimit) || 0,
            }
          : emptyForm,
      );
    }
  }, [open, customer]);

  const save = useMutation({
    mutationFn: async () =>
      editing
        ? (await api.patch(`/customers/${customer!.id}`, form)).data
        : (await api.post('/customers', form)).data,
    onSuccess: () => {
      toast.success(editing ? 'Customer updated' : 'Customer created');
      qc.invalidateQueries({ queryKey: ['customers'] });
      setOpen(false);
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'Could not save customer'),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{editing ? 'Edit Customer' : 'New Customer'}</DialogTitle>
          <DialogDescription>
            {editing ? 'Update this customer’s details.' : 'Add a customer you sell to.'}
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
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Phone</Label>
              <Input
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Credit Limit</Label>
              <Input
                type="number"
                value={form.creditLimit}
                onChange={(e) => setForm({ ...form, creditLimit: Number(e.target.value) })}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Email</Label>
            <Input
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Address</Label>
            <Input
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

export function CustomersPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const perms = useAuthStore((s) => s.user?.permissions);
  const canUpdate = grantsPermission(perms, 'customers:update');
  const canDelete = grantsPermission(perms, 'customers:delete');
  const showActions = canUpdate || canDelete;

  const { data: customers = [], isLoading } = useQuery<Customer[]>({
    queryKey: ['customers', search],
    queryFn: async () => (await api.get('/customers', { params: { search } })).data,
  });

  const del = useMutation({
    mutationFn: async (id: string) => (await api.delete(`/customers/${id}`)).data,
    onSuccess: () => {
      toast.success('Customer deleted');
      qc.invalidateQueries({ queryKey: ['customers'] });
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'Could not delete customer'),
  });

  const remove = (c: Customer) => {
    if (window.confirm(`Delete customer “${c.name}”? This cannot be undone.`)) del.mutate(c.id);
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
            placeholder="Search customers…"
            className="w-72 pl-8"
          />
        </div>
        <CustomerDialog
          trigger={
            <Button>
              <Plus className="h-4 w-4" /> Add Customer
            </Button>
          }
        />
      </div>

      <Card className="overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th className="px-4 py-3 font-medium">Customer</th>
              <th className="px-4 py-3 font-medium">Phone</th>
              <th className="px-4 py-3 font-medium">Email</th>
              <th className="px-4 py-3 text-right font-medium">Credit Limit</th>
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
              customers.map((c) => (
                <tr key={c.id} className="border-b last:border-0 hover:bg-muted/30">
                  <td className="px-4 py-3 font-medium">{c.name}</td>
                  <td className="px-4 py-3 text-muted-foreground">{c.phone ?? '—'}</td>
                  <td className="px-4 py-3 text-muted-foreground">{c.email ?? '—'}</td>
                  <td className="px-4 py-3 text-right">{formatCurrency(Number(c.creditLimit))}</td>
                  <td className="px-4 py-3 text-right font-medium">
                    {formatCurrency(c.outstanding)}
                  </td>
                  {showActions && (
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1">
                        {canUpdate && (
                          <CustomerDialog
                            customer={c}
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
                            onClick={() => remove(c)}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            {!isLoading && customers.length === 0 && (
              <tr>
                <td colSpan={colSpan} className="px-4 py-10 text-center text-muted-foreground">
                  No customers yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
