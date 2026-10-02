import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';
import { useStorefrontStore } from '@/store/storefront';
import { useAuthStore } from '@/store/auth';
import { canPickWorkingDate, useWorkingDateStore } from '@/store/workingDate';
import { useLanguage } from '@/components/language-provider';
import { DayEndCloseDialog } from '@/components/day-end-close-dialog';

interface LiveDayStatus {
  isOpen: boolean;
  state: 'CURRENT' | 'LATE_NIGHT' | 'STALE' | 'CLOSED' | 'NONE';
  openDate?: string;
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
 * dayEndService.sessionState). Every user can close the day, so everyone
 * gets the non-dismissable Day End form — new sales are blocked until it's
 * closed. Re-checked on window
 * focus and every few minutes, so a till left open overnight catches it too.
 */
export function StaleDayGuard() {
  const { t } = useLanguage();
  const currentStoreId = useStorefrontStore((s) => s.currentStoreId);
  const hasSpecificStore = !!currentStoreId && currentStoreId !== 'ALL';
  const role = useAuthStore((s) => s.user?.role);
  const isAdmin = canPickWorkingDate(role);
  const workingDate = useWorkingDateStore((s) => s.workingDate);
  const setWorkingDate = useWorkingDateStore((s) => s.setWorkingDate);

  const { data: live } = useQuery<LiveDayStatus>({
    queryKey: ['day-end-live', currentStoreId],
    queryFn: async () => (await api.get('/day-end', { params: { store: currentStoreId } })).data,
    enabled: hasSpecificStore,
    refetchOnWindowFocus: true,
    refetchInterval: 5 * 60 * 1000,
  });

  if (!hasSpecificStore || !live || live.state !== 'STALE' || !live.openDate) return null;
  // An admin who picked that day in the header is deliberately working on it
  // (e.g. back-filling a past date) — entries are dated explicitly, so
  // there's nothing to force closed.
  if (isAdmin && workingDate === live.openDate) return null;

  const day = formatDay(live.openDate);

  return (
    <DayEndCloseDialog
      open
      mandatory
      onOpenChange={() => {}}
      storeId={currentStoreId as string}
      title={t('End the last day first')}
      description={`${t('The day opened on')} ${day} ${t('was never closed. Close it now — enter the cash being submitted to the admin, and the rest carries forward to today.')}`}
      extraAction={
        isAdmin ? (
          <Button
            type="button"
            variant="outline"
            className="w-full"
            onClick={() => setWorkingDate(live.openDate ?? null)}
          >
            {`${t('Keep working on')} ${day}`}
          </Button>
        ) : undefined
      }
    />
  );
}
