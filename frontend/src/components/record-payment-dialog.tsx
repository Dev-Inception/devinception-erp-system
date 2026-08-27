import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
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
import { useBankAccounts } from '@/lib/bankAccounts';

interface SaleForPayment {
  id: string;
  saleNumber: string;
  balanceDue: number;
  storeId?: string;
}

const METHODS = [
  { value: 'CASH', label: 'Cash' },
  { value: 'BANK_TRANSFER', label: 'Bank transfer' },
  { value: 'ONLINE', label: 'Online' },
  { value: 'CARD', label: 'Card' },
];

/**
 * Records a payment collected after checkout against a specific sale's
 * remaining balance (e.g. the customer settles up on delivery). Separate
 * from editing the sale's items — this only ever adds a payment.
 */
export function RecordPaymentDialog({
  sale,
  open,
  onOpenChange,
}: {
  sale: SaleForPayment | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const qc = useQueryClient();
  const [amount, setAmount] = useState<number>(0);
  const [method, setMethod] = useState('CASH');
  const [bankAccount, setBankAccount] = useState('');
  const [note, setNote] = useState('');

  useEffect(() => {
    if (!sale) return;
    setAmount(sale.balanceDue);
    setMethod('CASH');
    setBankAccount('');
    setNote('');
  }, [sale?.id]);

  const needsBank = method === 'BANK_TRANSFER' || method === 'ONLINE';
  const { data: bankAccounts = [] } = useBankAccounts(sale?.storeId, open && needsBank);
  const activeBankAccounts = bankAccounts.filter((b) => b.isActive);

  const submit = useMutation({
    mutationFn: async () =>
      (
        await api.post(`/sales/${sale!.id}/payments`, {
          amount,
          method,
          bankAccount: needsBank ? bankAccount || undefined : undefined,
          note: note.trim() || undefined,
        })
      ).data,
    onSuccess: () => {
      toast.success('Payment recorded');
      qc.invalidateQueries({ queryKey: ['sales'] });
      onOpenChange(false);
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'Could not record payment'),
  });

  const canSubmit =
    sale &&
    amount > 0 &&
    amount <= sale.balanceDue &&
    (!needsBank || bankAccount) &&
    !submit.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Record Payment</DialogTitle>
          <DialogDescription>{sale ? `Against sale ${sale.saleNumber}` : ''}</DialogDescription>
        </DialogHeader>

        {sale && (
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (canSubmit) submit.mutate();
            }}
          >
            <div className="rounded-lg border bg-muted/20 p-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Remaining balance</span>
                <span className="font-medium">{formatCurrency(sale.balanceDue)}</span>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Amount *</Label>
              <Input
                type="number"
                min={0}
                max={sale.balanceDue}
                step="0.01"
                value={amount || ''}
                onChange={(e) => setAmount(Number(e.target.value))}
                required
              />
              {amount > sale.balanceDue && (
                <p className="text-xs text-destructive">Cannot exceed the remaining balance.</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label>Method</Label>
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
                <Label>Bank account *</Label>
                <select
                  value={bankAccount}
                  onChange={(e) => setBankAccount(e.target.value)}
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                  required
                >
                  <option value="">Select account…</option>
                  {activeBankAccounts.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="space-y-1.5">
              <Label>Note (optional)</Label>
              <Input value={note} onChange={(e) => setNote(e.target.value)} />
            </div>

            <Button type="submit" className="w-full" disabled={!canSubmit}>
              {submit.isPending ? 'Recording…' : 'Record Payment'}
            </Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
