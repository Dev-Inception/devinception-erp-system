import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Search, Loader2 } from 'lucide-react';
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
  DialogTrigger,
  DialogClose,
} from '@/components/ui/dialog';
import { api } from '@/lib/api';
import { formatCurrency } from '@/lib/utils';

interface Customer {
  id: string;
  name: string;
  phone?: string;
  email?: string;
  creditLimit: string;
  outstanding: number;
}

function CreateCustomerDialog() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: '', phone: '', email: '', address: '', creditLimit: 0 });

  const create = useMutation({
    mutationFn: async () => (await api.post('/customers', form)).data,
    onSuccess: () => {
      toast.success('Customer created');
      qc.invalidateQueries({ queryKey: ['customers'] });
      setForm({ name: '', phone: '', email: '', address: '', creditLimit: 0 });
      setOpen(false);
    },
    onError: () => toast.error('Could not create customer'),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="h-4 w-4" /> Add Customer
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New Customer</DialogTitle>
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
            <Button type="submit" disabled={create.isPending}>
              {create.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Save
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function CustomersPage() {
  const [search, setSearch] = useState('');
  const { data: customers = [], isLoading } = useQuery<Customer[]>({
    queryKey: ['customers', search],
    queryFn: async () => (await api.get('/customers', { params: { search } })).data,
  });

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
        <CreateCustomerDialog />
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
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-muted-foreground">
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
                </tr>
              ))}
            {!isLoading && customers.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-muted-foreground">
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
