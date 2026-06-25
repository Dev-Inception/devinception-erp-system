import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowDownLeft, ArrowUpRight, Loader2, Plus, Wallet, Landmark } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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

interface CashRow {
  id: string;
  date: string;
  type: 'CASH_IN' | 'CASH_OUT';
  description?: string;
  in: number;
  out: number;
  balanceAfter: number;
}
interface BankAccount {
  id: string;
  name: string;
  bankName?: string;
  balance: string;
}

function AddCashDialog() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ type: 'CASH_IN', amount: 0, description: '' });

  const create = useMutation({
    mutationFn: async () => (await api.post('/cash', form)).data,
    onSuccess: () => {
      toast.success('Recorded');
      qc.invalidateQueries({ queryKey: ['cash'] });
      setForm({ type: 'CASH_IN', amount: 0, description: '' });
      setOpen(false);
    },
    onError: () => toast.error('Failed'),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="h-4 w-4" /> Cash entry
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Cash Entry</DialogTitle>
        </DialogHeader>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            create.mutate();
          }}
        >
          <div className="grid grid-cols-2 gap-2">
            {(['CASH_IN', 'CASH_OUT'] as const).map((t) => (
              <Button
                key={t}
                type="button"
                variant={form.type === t ? 'default' : 'outline'}
                onClick={() => setForm({ ...form, type: t })}
              >
                {t === 'CASH_IN' ? 'Cash In' : 'Cash Out'}
              </Button>
            ))}
          </div>
          <div className="space-y-1.5">
            <Label>Amount</Label>
            <Input type="number" step="0.01" required value={form.amount || ''} onChange={(e) => setForm({ ...form, amount: Number(e.target.value) })} />
          </div>
          <div className="space-y-1.5">
            <Label>Description</Label>
            <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <DialogClose asChild>
              <Button type="button" variant="outline">Cancel</Button>
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

function AddBankDialog() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: '', bankName: '' });
  const create = useMutation({
    mutationFn: async () => (await api.post('/bank/accounts', form)).data,
    onSuccess: () => {
      toast.success('Bank account added');
      qc.invalidateQueries({ queryKey: ['bank-accounts'] });
      setForm({ name: '', bankName: '' });
      setOpen(false);
    },
    onError: () => toast.error('Failed'),
  });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <Plus className="h-4 w-4" /> Bank account
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>New Bank Account</DialogTitle>
        </DialogHeader>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            create.mutate();
          }}
        >
          <div className="space-y-1.5">
            <Label>Account name</Label>
            <Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>Bank</Label>
            <Input value={form.bankName} onChange={(e) => setForm({ ...form, bankName: e.target.value })} />
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <DialogClose asChild>
              <Button type="button" variant="outline">Cancel</Button>
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

export function CashPage() {
  const { data: cash } = useQuery<{ balance: number; rows: CashRow[] }>({
    queryKey: ['cash'],
    queryFn: async () => (await api.get('/cash')).data,
  });
  const { data: banks = [] } = useQuery<BankAccount[]>({
    queryKey: ['bank-accounts'],
    queryFn: async () => (await api.get('/bank/accounts')).data,
  });

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
      <Card className="overflow-hidden">
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle className="flex items-center gap-2"><Wallet className="h-4 w-4" /> Cash Ledger</CardTitle>
            <p className="mt-1 text-2xl font-bold">{formatCurrency(cash?.balance ?? 0)}</p>
          </div>
          <AddCashDialog />
        </CardHeader>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-y bg-muted/50 text-left text-xs uppercase text-muted-foreground">
                <th className="px-4 py-2 font-medium">Date</th>
                <th className="px-4 py-2 font-medium">Description</th>
                <th className="px-4 py-2 text-right font-medium">In</th>
                <th className="px-4 py-2 text-right font-medium">Out</th>
                <th className="px-4 py-2 text-right font-medium">Balance</th>
              </tr>
            </thead>
            <tbody>
              {(cash?.rows ?? []).map((r) => (
                <tr key={r.id} className="border-b last:border-0">
                  <td className="px-4 py-2 text-muted-foreground">{new Date(r.date).toLocaleDateString()}</td>
                  <td className="px-4 py-2">{r.description ?? '—'}</td>
                  <td className="px-4 py-2 text-right text-success">
                    {r.in ? <span className="inline-flex items-center gap-1"><ArrowDownLeft className="h-3 w-3" />{formatCurrency(r.in)}</span> : ''}
                  </td>
                  <td className="px-4 py-2 text-right text-destructive">
                    {r.out ? <span className="inline-flex items-center gap-1"><ArrowUpRight className="h-3 w-3" />{formatCurrency(r.out)}</span> : ''}
                  </td>
                  <td className="px-4 py-2 text-right font-medium">{formatCurrency(r.balanceAfter)}</td>
                </tr>
              ))}
              {(!cash || cash.rows.length === 0) && (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">No cash movements yet.</td></tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Card className="h-fit">
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="flex items-center gap-2"><Landmark className="h-4 w-4" /> Bank</CardTitle>
          <AddBankDialog />
        </CardHeader>
        <CardContent className="space-y-2">
          {banks.map((b) => (
            <div key={b.id} className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <p className="text-sm font-medium">{b.name}</p>
                <p className="text-xs text-muted-foreground">{b.bankName ?? '—'}</p>
              </div>
              <span className="font-semibold">{formatCurrency(Number(b.balance))}</span>
            </div>
          ))}
          {banks.length === 0 && <p className="text-sm text-muted-foreground">No bank accounts yet.</p>}
        </CardContent>
      </Card>
    </div>
  );
}
