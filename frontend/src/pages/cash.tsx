import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowDownLeft,
  ArrowUpRight,
  Loader2,
  Pencil,
  Plus,
  Wallet,
  Landmark,
  AlertTriangle,
} from 'lucide-react';
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
import { useStorefrontFilter, useStorefrontStore } from '@/store/storefront';
import { useLanguage } from '@/components/language-provider';

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
  accountNumber?: string;
  storeId?: string;
  isActive: boolean;
  balance: string;
}
interface StoreOption {
  id: string;
  name: string;
  code?: string;
}

function AddCashDialog() {
  const qc = useQueryClient();
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ type: 'CASH_IN', amount: 0, description: '' });
  const currentStoreId = useStorefrontStore((s) => s.currentStoreId);
  // A cash entry always affects one physical store's till — "All Stores"
  // isn't a real drawer it can be recorded against.
  const hasSpecificStore = !!currentStoreId && currentStoreId !== 'ALL';

  const create = useMutation({
    mutationFn: async () => {
      if (!hasSpecificStore) {
        throw new Error('Select a specific store from the header before recording a cash entry.');
      }
      return (await api.post('/cash', { ...form, storeId: currentStoreId })).data;
    },
    onSuccess: () => {
      toast.success('Recorded');
      qc.invalidateQueries({ queryKey: ['cash'] });
      setForm({ type: 'CASH_IN', amount: 0, description: '' });
      setOpen(false);
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? e?.message ?? 'Failed'),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="h-4 w-4" /> {t('Cash entry')}
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
          {!hasSpecificStore && (
            <div className="flex items-center gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              Select a specific store from the header first.
            </div>
          )}
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
            <Input
              type="number"
              step="0.01"
              required
              value={form.amount || ''}
              onChange={(e) => setForm({ ...form, amount: Number(e.target.value) })}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Description</Label>
            <Input
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <DialogClose asChild>
              <Button type="button" variant="outline">
                {t('Cancel')}
              </Button>
            </DialogClose>
            <Button type="submit" disabled={create.isPending || !hasSpecificStore}>
              {create.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              {t('Save')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ── Add a bank account — always scoped to the store currently selected in
   the header, same as AddCashDialog, so it's unambiguous which store's
   invoices will show these details. ── */
function AddBankDialog() {
  const qc = useQueryClient();
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: '', bankName: '', accountNumber: '' });
  const currentStoreId = useStorefrontStore((s) => s.currentStoreId);
  const hasSpecificStore = !!currentStoreId && currentStoreId !== 'ALL';

  const create = useMutation({
    mutationFn: async () => {
      if (!hasSpecificStore) {
        throw new Error('Select a specific store from the header before adding a bank account.');
      }
      return (await api.post('/bank/accounts', { ...form, storeId: currentStoreId })).data;
    },
    onSuccess: () => {
      toast.success('Bank account added');
      qc.invalidateQueries({ queryKey: ['bank-accounts'] });
      setForm({ name: '', bankName: '', accountNumber: '' });
      setOpen(false);
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? e?.message ?? 'Failed'),
  });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <Plus className="h-4 w-4" /> {t('Bank account')}
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
          {!hasSpecificStore && (
            <div className="flex items-center gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              Select a specific store from the header first.
            </div>
          )}
          <div className="space-y-1.5">
            <Label>Account title</Label>
            <Input
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Bank</Label>
            <Input
              value={form.bankName}
              onChange={(e) => setForm({ ...form, bankName: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Account number / IBAN</Label>
            <Input
              value={form.accountNumber}
              onChange={(e) => setForm({ ...form, accountNumber: e.target.value })}
              placeholder={t('Shown on this store’s printed invoices')}
            />
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <DialogClose asChild>
              <Button type="button" variant="outline">
                {t('Cancel')}
              </Button>
            </DialogClose>
            <Button type="submit" disabled={create.isPending || !hasSpecificStore}>
              {create.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              {t('Save')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ── Edit a bank account — name/bank/account number, active toggle, and
   (unlike Add) an explicit store picker so a legacy account created before
   per-store bank accounts existed can be assigned to one. ── */
function EditBankDialog({
  account,
  open,
  onOpenChange,
}: {
  account: BankAccount;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const qc = useQueryClient();
  const { t } = useLanguage();
  const [form, setForm] = useState({
    name: account.name,
    bankName: account.bankName ?? '',
    accountNumber: account.accountNumber ?? '',
    storeId: account.storeId ?? '',
    isActive: account.isActive,
  });
  const { data: stores = [] } = useQuery<StoreOption[]>({
    queryKey: ['stores'],
    queryFn: async () => (await api.get('/stores')).data,
    enabled: open,
  });

  const save = useMutation({
    mutationFn: async () => (await api.patch(`/bank/accounts/${account.id}`, form)).data,
    onSuccess: () => {
      toast.success('Bank account updated');
      qc.invalidateQueries({ queryKey: ['bank-accounts'] });
      onOpenChange(false);
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'Failed'),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Edit Bank Account</DialogTitle>
        </DialogHeader>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate();
          }}
        >
          <div className="space-y-1.5">
            <Label>Account title</Label>
            <Input
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Bank</Label>
            <Input
              value={form.bankName}
              onChange={(e) => setForm({ ...form, bankName: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Account number / IBAN</Label>
            <Input
              value={form.accountNumber}
              onChange={(e) => setForm({ ...form, accountNumber: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Store</Label>
            <select
              required
              value={form.storeId}
              onChange={(e) => setForm({ ...form, storeId: e.target.value })}
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
            >
              <option value="" disabled>
                {t('Select store…')}
              </option>
              {stores.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                  {s.code ? ` (${s.code})` : ''}
                </option>
              ))}
            </select>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.isActive}
              onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
            />
            {t('Active')}
          </label>
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

export function CashPage() {
  const { t } = useLanguage();
  const storefront = useStorefrontFilter();
  const [editingAccount, setEditingAccount] = useState<BankAccount | null>(null);
  const { data: cash } = useQuery<{ balance: number; rows: CashRow[] }>({
    queryKey: ['cash', storefront.store],
    queryFn: async () => (await api.get('/cash', { params: storefront })).data,
  });
  const { data: banks = [] } = useQuery<BankAccount[]>({
    queryKey: ['bank-accounts', storefront.store],
    queryFn: async () => (await api.get('/bank/accounts', { params: storefront })).data,
  });

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
      <Card className="overflow-hidden">
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Wallet className="h-4 w-4" /> Cash Ledger
            </CardTitle>
            <p className="mt-1 text-2xl font-bold">{formatCurrency(cash?.balance ?? 0)}</p>
          </div>
          <AddCashDialog />
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-y bg-muted/50 text-left text-xs uppercase text-muted-foreground">
                  <th className="px-4 py-2 font-medium">{t('Date')}</th>
                  <th className="px-4 py-2 font-medium">{t('Description')}</th>
                  <th className="px-4 py-2 text-right font-medium">{t('In')}</th>
                  <th className="px-4 py-2 text-right font-medium">{t('Out')}</th>
                  <th className="px-4 py-2 text-right font-medium">{t('Balance')}</th>
                </tr>
              </thead>
              <tbody>
                {(cash?.rows ?? []).map((r) => (
                  <tr key={r.id} className="border-b last:border-0">
                    <td className="px-4 py-2 text-muted-foreground">
                      {new Date(r.date).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-2">{r.description ?? '—'}</td>
                    <td className="px-4 py-2 text-right text-success">
                      {r.in ? (
                        <span className="inline-flex items-center gap-1">
                          <ArrowDownLeft className="h-3 w-3" />
                          {formatCurrency(r.in)}
                        </span>
                      ) : (
                        ''
                      )}
                    </td>
                    <td className="px-4 py-2 text-right text-destructive">
                      {r.out ? (
                        <span className="inline-flex items-center gap-1">
                          <ArrowUpRight className="h-3 w-3" />
                          {formatCurrency(r.out)}
                        </span>
                      ) : (
                        ''
                      )}
                    </td>
                    <td className="px-4 py-2 text-right font-medium">
                      {formatCurrency(r.balanceAfter)}
                    </td>
                  </tr>
                ))}
                {(!cash || cash.rows.length === 0) && (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                      No cash movements yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Card className="h-fit">
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="flex items-center gap-2">
            <Landmark className="h-4 w-4" /> Bank
          </CardTitle>
          <AddBankDialog />
        </CardHeader>
        <CardContent className="space-y-2">
          {banks.map((b) => (
            <div key={b.id} className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <p className="flex items-center gap-1.5 text-sm font-medium">
                  {b.name}
                  {!b.storeId && (
                    <span className="rounded-full bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-600">
                      {t('No store')}
                    </span>
                  )}
                  {!b.isActive && (
                    <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                      {t('Inactive')}
                    </span>
                  )}
                </p>
                <p className="text-xs text-muted-foreground">
                  {b.bankName ?? '—'}
                  {b.accountNumber ? ` · ${b.accountNumber}` : ''}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-semibold">{formatCurrency(Number(b.balance))}</span>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7"
                  title={t('Edit')}
                  onClick={() => setEditingAccount(b)}
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          ))}
          {banks.length === 0 && (
            <p className="text-sm text-muted-foreground">No bank accounts yet.</p>
          )}
        </CardContent>
      </Card>

      {editingAccount && (
        <EditBankDialog
          account={editingAccount}
          open={editingAccount !== null}
          onOpenChange={(o) => !o && setEditingAccount(null)}
        />
      )}
    </div>
  );
}
