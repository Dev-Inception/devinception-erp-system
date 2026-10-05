import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { CalendarDays, Lock, Unlock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { useStorefrontStore } from '@/store/storefront';
import { useAuthStore } from '@/store/auth';
import { canPickWorkingDate, localDateStr, useWorkingDateStore } from '@/store/workingDate';
import { useLanguage } from '@/components/language-provider';
import { DayEndCloseDialog } from '@/components/day-end-close-dialog';

interface DayStatus {
  isOpen: boolean;
  state: 'CURRENT' | 'LATE_NIGHT' | 'STALE' | 'CLOSED' | 'NONE' | 'EDITING';
  // A past day an admin reopened to add or change entries on it.
  editing: boolean;
  handoverAmount?: number;
  businessDate?: string;
  openDate?: string;
}

function shortDay(date: string) {
  return new Date(`${date}T00:00:00`).toLocaleDateString(undefined, {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

/**
 * The header's business-day control, shown to every user: which date the
 * store is working on, whether that day is open, and the Open / Close
 * buttons for the live day. Previous days are closed. Only a super admin or
 * store admin can pick a past date and reopen it; once reopened, every
 * sale, expense and payment they make is posted to that date (see
 * store/workingDate) until they close it again.
 */
export function DayControl() {
  const { t } = useLanguage();
  const qc = useQueryClient();
  const currentStoreId = useStorefrontStore((s) => s.currentStoreId);
  const hasSpecificStore = !!currentStoreId && currentStoreId !== 'ALL';
  const role = useAuthStore((s) => s.user?.role);
  const isAdmin = canPickWorkingDate(role);
  const workingDate = useWorkingDateStore((s) => s.workingDate);
  const setWorkingDate = useWorkingDateStore((s) => s.setWorkingDate);
  const [closeDialog, setCloseDialog] = useState(false);
  const today = localDateStr();

  // A picked date belongs to the store it was picked for.
  useEffect(() => {
    setWorkingDate(null);
  }, [currentStoreId, setWorkingDate]);

  // Shared cache key with the Day Book and StaleDayGuard.
  const { data: live } = useQuery<DayStatus>({
    queryKey: ['day-end-live', currentStoreId],
    queryFn: async () => (await api.get('/day-end', { params: { store: currentStoreId } })).data,
    enabled: hasSpecificStore,
  });
  const businessDate = live?.businessDate ?? today;
  const date = workingDate ?? businessDate;

  const { data: status } = useQuery<DayStatus>({
    queryKey: ['day-end', currentStoreId, date],
    queryFn: async () =>
      (await api.get('/day-end', { params: { store: currentStoreId, date } })).data,
    enabled: hasSpecificStore,
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['day-end'] });
    qc.invalidateQueries({ queryKey: ['day-end-live'] });
  };

  // Cash in hand is recorded from the Day Book (a Cash In entry), so opening
  // a day just carries forward what the last close left.
  const openDay = useMutation({
    mutationFn: async () =>
      (await api.post('/day-end/open', { store: currentStoreId, date: today })).data,
    onSuccess: () => {
      toast.success(t('Day opened'));
      invalidate();
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? t('Could not open the day')),
  });

  const reopenDay = useMutation({
    mutationFn: async (day?: string) =>
      (await api.post('/day-end/reopen', { store: currentStoreId, date: day })).data,
    onSuccess: () => {
      toast.success(t('Day reopened'));
      invalidate();
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? t('Could not reopen the day')),
  });

  if (!hasSpecificStore) return null;

  // Today needs no override; any past date (even the open day's own date,
  // after midnight) is sent explicitly so entries land exactly on it.
  const pickDate = (value: string) => {
    if (!value || value > today) return;
    setWorkingDate(value === today ? null : value);
  };

  const past = date < today;
  const opened = !!status && status.state !== 'NONE';
  const isOpen = !!status?.isOpen && opened;
  const editing = !!status?.editing;
  const liveOpen = !!live?.isOpen && live.state !== 'NONE';
  // The live day (not a reopened past one) is what everyone opens/closes.
  const isLiveSession = !editing && !!live?.openDate && status?.openDate === live.openDate;
  const canOpen = !!status && !past && !opened && !liveOpen;
  const canClose = isOpen && (editing ? isAdmin : isLiveSession);
  // Any past day can be reopened by an admin; today only once it was closed.
  const canReopen = isAdmin && !!status && !isOpen && (past || (opened && isLiveSession));
  const backdated = !!workingDate && workingDate < today;

  // Select a date, then one click: no cash-in-hand form (that's a Cash In
  // entry in the Day Book).
  const handleReopen = () => reopenDay.mutate(past ? date : undefined);

  return (
    <div className="flex min-w-0 items-center gap-1.5">
      <label
        className={cn(
          'relative flex h-9 cursor-pointer items-center gap-2 rounded-md border px-2.5 text-sm',
          backdated && 'border-amber-500 bg-amber-500/10 text-amber-700 dark:text-amber-400',
        )}
        title={
          backdated
            ? t('Working on a past date — once reopened, new entries are posted to this date')
            : t('Business day')
        }
      >
        <CalendarDays className="h-4 w-4 shrink-0 text-muted-foreground" />
        <span className="hidden whitespace-nowrap font-medium sm:inline">{shortDay(date)}</span>
        <span className="whitespace-nowrap font-medium sm:hidden">
          {new Date(`${date}T00:00:00`).toLocaleDateString(undefined, {
            day: '2-digit',
            month: 'short',
          })}
        </span>
        {isAdmin && (
          // Invisible native picker over the label, so the label itself
          // (with the weekday) is what's shown.
          <input
            type="date"
            value={date}
            max={today}
            onChange={(e) => pickDate(e.target.value)}
            onClick={(e) => e.currentTarget.showPicker?.()}
            className="absolute inset-0 cursor-pointer opacity-0"
            aria-label={t('Business day')}
          />
        )}
      </label>

      {status && (
        <span
          className={cn(
            'flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium',
            isOpen && 'bg-success/10 text-success',
            !isOpen && (opened || past) && 'bg-destructive/10 text-destructive',
            !isOpen && !opened && !past && 'bg-muted text-muted-foreground',
          )}
        >
          {isOpen ? <Unlock className="h-3 w-3" /> : <Lock className="h-3 w-3" />}
          {isOpen
            ? editing
              ? t('Reopened')
              : t('Open')
            : opened || past
              ? t('Closed')
              : t('Not opened')}
        </span>
      )}

      {canOpen && (
        <Button
          size="sm"
          variant="outline"
          onClick={() => openDay.mutate()}
          disabled={openDay.isPending}
        >
          <Unlock className="h-4 w-4" />
          <span className="hidden sm:inline">{t('Open Day')}</span>
        </Button>
      )}
      {canClose && (
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            // Sales, expenses and cash entries made since the status was last
            // fetched change the drawer — refetch so the form shows the real
            // cash on hand (it updates its prefill when the figure arrives).
            invalidate();
            setCloseDialog(true);
          }}
        >
          <Lock className="h-4 w-4" />
          <span className="hidden sm:inline">{t('Close Day')}</span>
        </Button>
      )}
      {canReopen && (
        <Button size="sm" variant="outline" onClick={handleReopen} disabled={reopenDay.isPending}>
          <Unlock className="h-4 w-4" />
          <span className="hidden sm:inline">{t('Reopen Day')}</span>
        </Button>
      )}

      <DayEndCloseDialog
        open={closeDialog}
        onOpenChange={setCloseDialog}
        storeId={currentStoreId as string}
        date={editing ? date : undefined}
        // A reopened day keeps what was submitted when it first closed; a day
        // that was never closed (0 recorded) prefills the whole drawer.
        defaultHandover={editing && status?.handoverAmount ? status.handoverAmount : undefined}
        description={
          editing
            ? t(
                'Closing this past day again updates its closing cash, and the difference carries forward into every later day.',
              )
            : undefined
        }
      />
    </div>
  );
}
