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

interface VendorForPayment {
  id: string;
  name: string;
  /** Current vendor-receivable balance — what this vendor owes us. */
  balance: number;
}

const METHODS = [
  { value: 'CASH', label: 'Cash' },
  { value: 'BANK_TRANSFER', label: 'Bank transfer' },
  { value: 'ONLINE', label: 'Online' },
  { value: 'CARD', label: 'Card' },
];

/**
 * Records a payment IN (the vendor paying down what they owe us for stock
 * they've bought) or OUT (a refund) against the vendor-receivable ledger —
 * separate from PayVendorDialog, which settles the vendor's own AP balance
 * for stock we've sourced from them.
 */
export function VendorReceivablePaymentDialog({
  vendor,
  direction,
  open,
  onOpenChange,
}: {
  vendor: VendorForPayment | null;
  direction: 'IN' | 'OUT';
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
    if (!vendor) return;
    setAmount(direction === 'IN' ? vendor.balance : 0);
    setMethod('CASH');
    setBankAccount('');
    setNote('');
  }, [vendor?.id, direction]);

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
      const url =
        direction === 'IN'
          ? '/finance/payments/vendor-receivable/receive'
          : '/finance/payments/vendor-receivable/refund';
      return (
        await api.post(url, {
          vendor: vendor!.id,
          store: currentStoreId,
          amount,
          method,
          bankAccount: needsBank ? bankAccount || undefined : undefined,
          note: note.trim() || undefined,
        })
      ).data;
    },
    onSuccess: () => {
      toast.success(direction === 'IN' ? 'Payment recorded' : 'Refund recorded');
      qc.invalidateQueries({ queryKey: ['vendor-receivable-ledger'] });
      qc.invalidateQueries({ queryKey: ['vendor-receivable-ledgers'] });
      onOpenChange(false);
    },
    onError: (e: any) =>
      toast.error(e?.response?.data?.message ?? e?.message ?? 'Could not record this'),
  });

  const canSubmit =
    vendor &&
    hasSpecificStore &&
    amount > 0 &&
    (direction === 'OUT' || amount <= vendor.balance) &&
    (!needsBank || bankAccount) &&
    !submit.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>
            {direction === 'IN' ? t('Receive Payment') : t('Refund Vendor')}
          </DialogTitle>
          <DialogDescription>{vendor ? vendor.name : ''}</DialogDescription>
        </DialogHeader>

        {vendor && (
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
                <span className="text-muted-foreground">{t('They owe us')}</span>
                <span className="font-medium">{formatCurrency(vendor.balance)}</span>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>{t('Amount')} *</Label>
              <Input
                type="number"
                min={0}
                max={direction === 'IN' ? vendor.balance : undefined}
                step="0.01"
                value={amount || ''}
                onChange={(e) => setAmount(Number(e.target.value))}
                required
              />
              {direction === 'IN' && amount > vendor.balance && (
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
              {submit.isPending
                ? t('Recording…')
                : direction === 'IN'
                  ? t('Record Payment')
                  : t('Record Refund')}
            </Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
