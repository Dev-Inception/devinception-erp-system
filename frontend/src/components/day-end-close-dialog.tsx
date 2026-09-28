import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { api } from '@/lib/api';
import { cn, formatCurrency } from '@/lib/utils';
import { useLanguage } from '@/components/language-provider';

/** The Day End handover form: how much cash goes to the admin, and what
 * carries forward as the next day's opening balance. Shared by the Day Book
 * and the app-wide "you forgot to end the last day" prompt
 * (StaleDayGuard). With `mandatory`, it can't be dismissed — closing the
 * day is the only way out. */
export function DayEndCloseDialog({
  open,
  onOpenChange,
  storeId,
  cashOnHand,
  title,
  description,
  mandatory = false,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  storeId: string;
  cashOnHand: number;
  title?: string;
  description?: string;
  mandatory?: boolean;
}) {
  const { t } = useLanguage();
  const qc = useQueryClient();
  const [handoverAmount, setHandoverAmount] = useState(0);

  // Prefill with the whole drawer each time the dialog opens.
  useEffect(() => {
    if (open) setHandoverAmount(cashOnHand);
  }, [open, cashOnHand]);

  const closeDay = useMutation({
    mutationFn: async () =>
      (await api.post('/day-end/close', { store: storeId, handoverAmount })).data,
    onSuccess: () => {
      toast.success(t('Day closed'));
      qc.invalidateQueries({ queryKey: ['day-end'] });
      qc.invalidateQueries({ queryKey: ['day-end-live'] });
      onOpenChange(false);
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? t('Could not close the day')),
  });

  const remaining = cashOnHand - handoverAmount;
  const block = (e: Event) => {
    if (mandatory) e.preventDefault();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => (mandatory && !o ? undefined : onOpenChange(o))}>
      <DialogContent
        className="max-w-sm"
        hideClose={mandatory}
        onInteractOutside={block}
        onEscapeKeyDown={block}
      >
        <DialogHeader>
          <DialogTitle>{title ?? t('Day End')}</DialogTitle>
          <DialogDescription>
            {description ??
              t(
                'Enter how much cash you are submitting to the admin. Anything left over carries forward as tomorrow’s opening balance.',
              )}
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!closeDay.isPending && handoverAmount >= 0) closeDay.mutate();
          }}
        >
          <div className="rounded-lg border bg-muted/20 p-3 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t('Cash on hand')}</span>
              <span className="font-medium">{formatCurrency(cashOnHand)}</span>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>{t('Amount submitted to admin')} *</Label>
            <Input
              type="number"
              min={0}
              step="0.01"
              value={handoverAmount || ''}
              onChange={(e) => setHandoverAmount(Number(e.target.value))}
              required
              autoFocus
            />
          </div>
          <div className="rounded-lg border bg-muted/20 p-3 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t('Carried forward to next day')}</span>
              <span className={cn('font-medium', remaining < 0 && 'text-destructive')}>
                {formatCurrency(remaining)}
              </span>
            </div>
          </div>
          <Button
            type="submit"
            className="w-full"
            disabled={closeDay.isPending || handoverAmount < 0}
          >
            {closeDay.isPending ? t('Closing…') : t('Close Day')}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
