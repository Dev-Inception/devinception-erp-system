import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
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
import { useLanguage } from '@/components/language-provider';

interface VendorSaleItemForReturn {
  productId: string;
  name: string;
  quantity: number;
}

interface VendorSaleForReturn {
  id: string;
  number: string;
  items: VendorSaleItemForReturn[];
}

interface PriorReturn {
  items: { productId: string; quantity: number }[];
}

/**
 * Returns some products against a vendor sale — restocks the returned
 * quantity into the sale's warehouse and reduces what the vendor owes. Each
 * submit creates one numbered VendorSaleReturn record; a vendor sale can
 * have several partial returns over time, so this caps each line at what
 * hasn't already been returned. Mirrors ReturnProductDialog (the customer
 * sale equivalent).
 */
export function ReturnVendorSaleItemsDialog({
  sale,
  open,
  onOpenChange,
}: {
  sale: VendorSaleForReturn | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useLanguage();
  const qc = useQueryClient();
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [note, setNote] = useState('');

  useEffect(() => {
    setQuantities({});
    setNote('');
  }, [sale?.id]);

  const { data: priorReturns = [] } = useQuery<PriorReturn[]>({
    queryKey: ['vendor-sale-returns', sale?.id],
    queryFn: async () => api.get(`/vendor-sales/${sale!.id}/returns`).then((r) => r.data),
    enabled: open && Boolean(sale?.id),
  });

  const alreadyReturned = new Map<string, number>();
  for (const r of priorReturns) {
    for (const it of r.items) {
      alreadyReturned.set(it.productId, (alreadyReturned.get(it.productId) ?? 0) + it.quantity);
    }
  }

  const rows = (sale?.items ?? []).map((it) => {
    const returned = alreadyReturned.get(it.productId) ?? 0;
    const max = Math.max(0, it.quantity - returned);
    return { ...it, returned, max };
  });

  const submit = useMutation({
    mutationFn: async () => {
      const items = rows
        .filter((r) => (quantities[r.productId] ?? 0) > 0)
        .map((r) => ({ productId: r.productId, quantity: quantities[r.productId] }));
      return (
        await api.post(`/vendor-sales/${sale!.id}/returns`, {
          items,
          note: note.trim() || undefined,
        })
      ).data;
    },
    onSuccess: () => {
      toast.success('Return recorded');
      qc.invalidateQueries({ queryKey: ['vendor-sales'] });
      qc.invalidateQueries({ queryKey: ['vendor-sales-for-vendor'] });
      qc.invalidateQueries({ queryKey: ['vendor-sale-returns', sale?.id] });
      qc.invalidateQueries({ queryKey: ['vendor-receivable-ledger'] });
      qc.invalidateQueries({ queryKey: ['vendor-receivable-ledgers'] });
      onOpenChange(false);
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'Could not record return'),
  });

  const hasAnySelected = Object.values(quantities).some((q) => q > 0);
  const hasInvalid = rows.some((r) => (quantities[r.productId] ?? 0) > r.max);
  const canSubmit = hasAnySelected && !hasInvalid && !submit.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('Return Items')}</DialogTitle>
          <DialogDescription>
            {sale ? `${t('Against vendor sale')} ${sale.number}` : ''} —{' '}
            {t('restocks the warehouse and reduces what the vendor owes.')}
          </DialogDescription>
        </DialogHeader>

        {sale && (
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (canSubmit) submit.mutate();
            }}
          >
            <div className="space-y-2">
              {rows.map((r) => (
                <div
                  key={r.productId}
                  className="grid grid-cols-[1fr_auto] items-center gap-3 rounded-md border p-2 text-sm"
                >
                  <div>
                    <p className="font-medium">{r.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {t('Sold')} {r.quantity}
                      {r.returned > 0 ? ` · ${t('already returned')} ${r.returned}` : ''} · {r.max}{' '}
                      {t('returnable')}
                    </p>
                  </div>
                  <Input
                    type="number"
                    min={0}
                    max={r.max}
                    step="any"
                    disabled={r.max <= 0}
                    className="h-9 w-24 text-right"
                    value={quantities[r.productId] || ''}
                    onChange={(e) =>
                      setQuantities((q) => ({ ...q, [r.productId]: Number(e.target.value) }))
                    }
                  />
                </div>
              ))}
              {rows.length === 0 && (
                <p className="py-4 text-center text-sm text-muted-foreground">
                  {t('Nothing left to return on this sale.')}
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label>{t('Reason / note (optional)')}</Label>
              <Input value={note} onChange={(e) => setNote(e.target.value)} />
            </div>

            <Button type="submit" className="w-full" disabled={!canSubmit}>
              {submit.isPending ? t('Recording…') : t('Record Return')}
            </Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
