import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { AlertTriangle } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { api } from '@/lib/api';
import { formatCurrency } from '@/lib/utils';
import { useStorefrontStore } from '@/store/storefront';
import { useLanguage } from '@/components/language-provider';
import { useBankAccounts } from '@/lib/bankAccounts';

interface LabourForPayment {
  id: string;
  name: string;
  outstanding: number;
}

const METHODS = [
  { value: 'CASH', label: 'Cash' },
  { value: 'BANK_TRANSFER', label: 'Bank transfer' },
  { value: 'ONLINE', label: 'Online' },
  { value: 'CARD', label: 'Card' },
];

/**
 * Pays down a labourer's overall AP_LABOUR balance — the labour counterpart
 * to PayVendorDialog.
 */
export function PayLabourDialog({
  labour,
  open,
  onOpenChange,
}: {
  labour: LabourForPayment | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useLanguage();
  const qc = useQueryClient();
  const [amount, setAmount] = useState<number>(0);
  const [method, setMethod] = useState('CASH');
  const [bankAccount, setBankAccount] = useState('');
  const [note, setNote] = useState('');
  const currentStoreId = useStorefrontStore((s) => s.currentStoreId);
  const hasSpecificStore = !!currentStoreId && currentStoreId !== 'ALL';

  useEffect(() => {
    if (!labour) return;
    setAmount(labour.outstanding);
    setMethod('CASH');
    setBankAccount('');
    setNote('');
  }, [labour?.id]);

  const needsBank = method === 'BANK_TRANSFER' || method === 'ONLINE';
  const { data: bankAccounts = [] } = useBankAccounts(
    hasSpecificStore ? currentStoreId : undefined,
    open && needsBank,
  );
  const activeBankAccounts = bankAccounts.filter((b) => b.isActive);

  const submit = useMutation({
    mutationFn: async () => {
      if (!hasSpecificStore) {
        throw new Error('Select a specific store from the header before recording a payment.');
      }
      return (
        await api.post('/finance/payments/labour', {
          labour: labour!.id,
          store: currentStoreId,
          amount,
          method,
          bankAccount: needsBank ? bankAccount || undefined : undefined,
          note: note.trim() || undefined,
        })
      ).data;
    },
    onSuccess: () => {
      toast.success('Payment recorded');
      qc.invalidateQueries({ queryKey: ['labour'] });
      qc.invalidateQueries({ queryKey: ['labour-ledger'] });
      onOpenChange(false);
    },
    onError: (e: any) =>
      toast.error(e?.response?.data?.message ?? e?.message ?? 'Could not record payment'),
  });

  const canSubmit =
    labour &&
    hasSpecificStore &&
    amount > 0 &&
    amount <= labour.outstanding &&
    (!needsBank || bankAccount) &&
    !submit.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{t('Pay Labour')}</DialogTitle>
          <DialogDescription>{labour ? labour.name : ''}</DialogDescription>
        </DialogHeader>

        {labour && (
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (canSubmit) submit.mutate();
            }}
          >
            {!hasSpecificStore && (
              <div className="flex items-center gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                {t('Select a specific store from the header first.')}
              </div>
            )}

            <div className="rounded-lg border bg-muted/20 p-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t('Outstanding balance')}</span>
                <span className="font-medium">{formatCurrency(labour.outstanding)}</span>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>{t('Amount')} *</Label>
              <Input
                type="number"
                min={0}
                max={labour.outstanding}
                step="0.01"
                value={amount || ''}
                onChange={(e) => setAmount(Number(e.target.value))}
                required
              />
              {amount > labour.outstanding && (
                <p className="text-xs text-destructive">
                  {t('Cannot exceed the outstanding balance.')}
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label>{t('Method')}</Label>
              <select
                value={method}
                onChange={(e) => setMethod(e.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
              >
                {METHODS.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
            </div>

            {needsBank && (
              <div className="space-y-1.5">
                <Label>{t('Bank account')} *</Label>
                <select
                  value={bankAccount}
                  onChange={(e) => setBankAccount(e.target.value)}
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                  required
                >
                  <option value="">{t('Select account…')}</option>
                  {activeBankAccounts.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="space-y-1.5">
              <Label>{t('Note (optional)')}</Label>
              <Input value={note} onChange={(e) => setNote(e.target.value)} />
            </div>

            <Button type="submit" className="w-full" disabled={!canSubmit}>
              {submit.isPending ? t('Recording…') : t('Record Payment')}
            </Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
