import { type ReactNode, useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
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
  title,
  description,
  mandatory = false,
  extraAction,
  date,
  defaultHandover,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  storeId: string;
  title?: string;
  description?: string;
  mandatory?: boolean;
  /** Rendered under the Close Day button — e.g. a way out of a mandatory
   * close for an admin who means to keep working on that day. */
  extraAction?: ReactNode;
  /** A past day an admin reopened (omit for the live day). */
  date?: string;
  /** Prefill for the amount submitted — a reopened day keeps what was
   * submitted the first time it closed. Defaults to the whole drawer. */
  defaultHandover?: number;
}) {
  const { t } = useLanguage();
  const qc = useQueryClient();
  const [handoverAmount, setHandoverAmount] = useState(0);

  // The drawer figure is fetched fresh from the server every time the form
  // opens (never from a cache) — sales, payments and cash entries made since
  // anything else last loaded would otherwise be missing from it.
  const { data: fresh, isFetching } = useQuery<{ cashOnHand?: number }>({
    queryKey: ['day-end-close', storeId, date ?? 'live'],
    queryFn: async () =>
      (await api.get('/day-end', { params: { store: storeId, date: date || undefined } })).data,
    enabled: open,
    staleTime: 0,
    gcTime: 0,
    refetchOnMount: 'always',
  });
  const loaded = !!fresh && !isFetching;
  const cashOnHand = fresh?.cashOnHand ?? 0;

  // Prefill once the fresh figure is in.
  useEffect(() => {
    if (open && loaded) setHandoverAmount(defaultHandover ?? cashOnHand);
  }, [open, loaded, cashOnHand, defaultHandover]);

  const closeDay = useMutation({
    mutationFn: async () =>
      (await api.post('/day-end/close', { store: storeId, date, handoverAmount })).data,
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
            if (loaded && !closeDay.isPending && handoverAmount >= 0) closeDay.mutate();
          }}
        >
          <div className="rounded-lg border bg-muted/20 p-3 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t('Cash on hand')}</span>
              <span className="font-medium">
                {loaded ? formatCurrency(cashOnHand) : t('Loading…')}
              </span>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>{t('Amount submitted to admin')}</Label>
            <Input
              type="number"
              min={0}
              step="0.01"
              value={handoverAmount || ''}
              onChange={(e) => setHandoverAmount(Number(e.target.value))}
              placeholder="0"
              autoFocus
            />
          </div>
          <div className="rounded-lg border bg-muted/20 p-3 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t('Carried forward to next day')}</span>
              <span className={cn('font-medium', remaining < 0 && 'text-destructive')}>
                {loaded ? formatCurrency(remaining) : '—'}
              </span>
            </div>
          </div>
          <Button
            type="submit"
            className="w-full"
            disabled={!loaded || closeDay.isPending || handoverAmount < 0}
          >
            {closeDay.isPending ? t('Closing…') : t('Close Day')}
          </Button>
          {extraAction}
        </form>
      </DialogContent>
    </Dialog>
  );
}
