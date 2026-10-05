import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2, Pencil, Plus, Landmark, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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

/* ── Add a bank account — always scoped to the store currently selected in
   the header, so it's unambiguous which store's
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

/** The store's bank accounts — shown on its printed invoices and offered
 * wherever a payment can be settled by bank/online. Lives in Settings. */
export function BankAccountsCard() {
  const { t } = useLanguage();
  const storefront = useStorefrontFilter();
  const [editingAccount, setEditingAccount] = useState<BankAccount | null>(null);
  const { data: banks = [] } = useQuery<BankAccount[]>({
    queryKey: ['bank-accounts', storefront.store],
    queryFn: async () => (await api.get('/bank/accounts', { params: storefront })).data,
  });

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
        <div className="space-y-1.5">
          <CardTitle className="flex items-center gap-2">
            <Landmark className="h-4 w-4" /> {t('Bank Accounts')}
          </CardTitle>
          <CardDescription>
            {t('Printed on this store’s invoices and used for bank/online payments.')}
          </CardDescription>
        </div>
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
          <p className="text-sm text-muted-foreground">{t('No bank accounts yet.')}</p>
        )}
      </CardContent>

      {editingAccount && (
        <EditBankDialog
          account={editingAccount}
          open={editingAccount !== null}
          onOpenChange={(o) => !o && setEditingAccount(null)}
        />
      )}
    </Card>
  );
}
