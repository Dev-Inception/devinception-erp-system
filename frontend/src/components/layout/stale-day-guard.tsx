import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { api } from '@/lib/api';
import { MODULES, canSeeModule } from '@/lib/modules';
import { useStorefrontStore } from '@/store/storefront';
import { useAuthStore } from '@/store/auth';
import { useLanguage } from '@/components/language-provider';
import { DayEndCloseDialog } from '@/components/day-end-close-dialog';

const DAY_BOOK_MODULE = MODULES.find((m) => m.key === 'day-book');

interface LiveDayStatus {
  isOpen: boolean;
  state: 'CURRENT' | 'LATE_NIGHT' | 'STALE' | 'CLOSED' | 'NONE';
  openDate?: string;
  cashOnHand?: number;
}

function formatDay(date: string) {
  return new Date(`${date}T00:00:00`).toLocaleDateString(undefined, {
    weekday: 'long',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

/**
 * App-wide check for a business day that was opened but never closed (the
 * backend marks it STALE once the rollover hour passes — see
 * dayEndService.sessionState). Someone who can close days gets a
 * non-dismissable Day End form; anyone else gets a notice to ask for it to be
 * closed, since new sales are blocked until it is. Re-checked on window
 * focus and every few minutes, so a till left open overnight catches it too.
 */
export function StaleDayGuard() {
  const { t } = useLanguage();
  const currentStoreId = useStorefrontStore((s) => s.currentStoreId);
  const hasSpecificStore = !!currentStoreId && currentStoreId !== 'ALL';
  const role = useAuthStore((s) => s.user?.role);
  const permissions = useAuthStore((s) => s.user?.permissions);
  const canClose = !!DAY_BOOK_MODULE && canSeeModule(role, permissions, DAY_BOOK_MODULE);
  const [dismissedFor, setDismissedFor] = useState<string | null>(null);

  const { data: live } = useQuery<LiveDayStatus>({
    queryKey: ['day-end-live', currentStoreId],
    queryFn: async () => (await api.get('/day-end', { params: { store: currentStoreId } })).data,
    enabled: hasSpecificStore,
    refetchOnWindowFocus: true,
    refetchInterval: 5 * 60 * 1000,
  });

  if (!hasSpecificStore || !live || live.state !== 'STALE' || !live.openDate) return null;

  const day = formatDay(live.openDate);

  if (canClose) {
    return (
      <DayEndCloseDialog
        open
        mandatory
        onOpenChange={() => {}}
        storeId={currentStoreId as string}
        cashOnHand={live.cashOnHand ?? 0}
        title={t('End the last day first')}
        description={`${t('The day opened on')} ${day} ${t('was never closed. Close it now — enter the cash being submitted to the admin, and the rest carries forward to today.')}`}
      />
    );
  }

  if (dismissedFor === live.openDate) return null;
  return (
    <Dialog open onOpenChange={(o) => !o && setDismissedFor(live.openDate ?? null)}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{t('The last day is still open')}</DialogTitle>
          <DialogDescription>
            {`${t('The day opened on')} ${day} ${t('was never closed. New sales are blocked until an admin closes it from the Day Book.')}`}
          </DialogDescription>
        </DialogHeader>
        <div className="flex justify-end">
          <Button onClick={() => setDismissedFor(live.openDate ?? null)}>{t('OK')}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
