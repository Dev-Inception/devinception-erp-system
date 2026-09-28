import { useEffect, useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useConfirm } from '@/components/confirm-provider';
import { BookText, ChevronLeft, ChevronRight, Download, Lock, Printer, Unlock } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { api } from '@/lib/api';
import { cn, formatCurrency } from '@/lib/utils';
import { MODULES, canSeeModule } from '@/lib/modules';
import { useStorefrontFilter, useStorefrontStore } from '@/store/storefront';
import { useAuthStore } from '@/store/auth';
import { useLanguage } from '@/components/language-provider';
import { DayEndCloseDialog } from '@/components/day-end-close-dialog';
import { DayBookEntryDialog } from '@/components/day-book-entry-dialog';

interface DayEndStatus {
  isOpen: boolean;
  // The business date this session was opened on — stays the same across
  // any number of midnights until the day is explicitly closed.
  openDate?: string;
  openedByName?: string;
  openedAt?: string;
  openingBalance?: number;
  // Only present while open: opening balance + net cash movement since.
  cashOnHand?: number;
  closedByName?: string;
  closedAt?: string;
  handoverAmount?: number;
  remainingBalance?: number;
  reopenedByName?: string;
  reopenedAt?: string;
  // Live state only (status fetched without a date) — see
  // dayEndService.sessionState / getStatus.
  state?: 'CURRENT' | 'LATE_NIGHT' | 'STALE' | 'CLOSED' | 'NONE';
  businessDate?: string;
}

const DAY_BOOK_MODULE = MODULES.find((m) => m.key === 'day-book');

interface DayBookRow {
  id: string;
  date: string;
  voucherType: string;
  voucherLabel: string;
  voucherNo: string;
  description: string;
  warehouse: string;
  amount: number;
}

interface CashFlowRow {
  id: string;
  date: string;
  voucherNo: string;
  description: string;
  cashIn: number;
  cashOut: number;
  balance: number;
}

interface BankReconciliationRow {
  id: string;
  date: string;
  voucherNo: string;
  description: string;
  bankName: string;
  transactionId: string;
  amount: number;
}

interface DayBookSummary {
  transactionCount: number;
  totalSales: number;
  totalCOGS: number;
  totalPurchases: number;
  totalExpenses: number;
  totalVendorPayments: number;
  totalCustomerReceipts: number;
  cashIn: number;
  cashOut: number;
  netCash: number;
  bankIn: number;
  bankOut: number;
  netBank: number;
}

interface DayBookResult {
  title: string;
  rows: DayBookRow[];
  summary: DayBookSummary;
  cashFlowRows: CashFlowRow[];
  bankReconciliationRows: BankReconciliationRow[];
}

// Formats a Date using its local calendar fields, not toISOString() (which is
// always UTC and rolls the date back/forward a day in timezones offset from UTC).
function formatLocalDate(d: Date) {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function todayStr() {
  return formatLocalDate(new Date());
}

function shiftDate(date: string, days: number) {
  const d = new Date(`${date}T00:00:00`);
  d.setDate(d.getDate() + days);
  return formatLocalDate(d);
}

function formatDisplayDate(date: string) {
  return new Date(`${date}T00:00:00`).toLocaleDateString(undefined, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function csvEscape(v: unknown) {
  const s = String(v ?? '').replace(/"/g, '""');
  return /[",\n]/.test(s) ? `"${s}"` : s;
}

export function DayBookPage() {
  const { t } = useLanguage();
  const qc = useQueryClient();
  const [date, setDate] = useState(todayStr);
  const [tab, setTab] = useState<'cash-flow' | 'bank-reconciliation'>('cash-flow');
  const [closeDialogOpen, setCloseDialogOpen] = useState(false);
  const [viewingEntryId, setViewingEntryId] = useState<string | null>(null);
  const today = todayStr();
  const storefront = useStorefrontFilter();
  const currentStoreId = useStorefrontStore((s) => s.currentStoreId);
  const hasSpecificStore = !!currentStoreId && currentStoreId !== 'ALL';
  const role = useAuthStore((s) => s.user?.role);
  const permissions = useAuthStore((s) => s.user?.permissions);
  // Anyone who can see the Day Book at all (same reports:read gate as the
  // page itself) can open or close the day; reopening a closed day is more
  // sensitive, so it's reserved for a super admin or this store's own admin.
  const canOpenClose = !!DAY_BOOK_MODULE && canSeeModule(role, permissions, DAY_BOOK_MODULE);
  const canReopen = role === 'ADMIN' || role === 'SUPER_ADMIN';

  // The store's live day state (no date): which business day is open right
  // now, even past midnight. Shared cache key with StaleDayGuard.
  const { data: live } = useQuery<DayEndStatus>({
    queryKey: ['day-end-live', currentStoreId],
    queryFn: async () => (await api.get('/day-end', { params: { store: currentStoreId } })).data,
    enabled: hasSpecificStore,
  });

  // The Date field is only a filter. It starts on the open business day —
  // so after midnight, a day opened yesterday still shows yesterday — and
  // after that it only changes when the user changes it.
  const dateInitialized = useRef(false);
  useEffect(() => {
    if (dateInitialized.current || !live?.businessDate) return;
    dateInitialized.current = true;
    setDate(live.businessDate);
  }, [live?.businessDate]);

  // The day currently being traded (open or not) — actions only show while
  // it's the one on screen.
  const businessDate = live?.businessDate ?? today;
  const isBusinessDay = date === businessDate;
  const liveOpen = !!live?.isOpen && live.state !== 'NONE';

  // Status of the session covering the date on screen (history badge).
  const { data: dayEnd } = useQuery<DayEndStatus>({
    queryKey: ['day-end', currentStoreId, date],
    queryFn: async () =>
      (await api.get('/day-end', { params: { store: currentStoreId, date } })).data,
    enabled: hasSpecificStore,
  });

  // One calendar day at a time. Late-night entries are already dated onto
  // the day that was open (11:59 PM), so no multi-day span is needed.
  const { data, isLoading } = useQuery<DayBookResult>({
    queryKey: ['day-book', date, storefront.store],
    queryFn: async () =>
      (
        await api.get('/reports/day-book', {
          params: { from: date, to: date, ...storefront },
        })
      ).data,
  });

  const invalidateDayEnd = () => {
    qc.invalidateQueries({ queryKey: ['day-end'] });
    qc.invalidateQueries({ queryKey: ['day-end-live'] });
  };

  const openDay = useMutation({
    mutationFn: async () => (await api.post('/day-end/open', { store: currentStoreId })).data,
    onSuccess: () => {
      toast.success('Day opened');
      // A day always opens on today's date — show it.
      setDate(todayStr());
      invalidateDayEnd();
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'Could not open the day'),
  });

  const reopenDay = useMutation({
    mutationFn: async () => (await api.post('/day-end/reopen', { store: currentStoreId })).data,
    onSuccess: () => {
      toast.success('Day reopened');
      invalidateDayEnd();
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'Could not reopen the day'),
  });

  const confirm = useConfirm();
  const handleOpenDay = async () => {
    const carry = live?.remainingBalance;
    const ok = await confirm({
      title: 'Open a new day for this store?',
      description:
        typeof carry === 'number' && carry !== 0
          ? `Opening balance will be ${formatCurrency(carry)}, carried forward from the last close.`
          : undefined,
      confirmLabel: 'Open Day',
    });
    if (ok) openDay.mutate();
  };
  const openCloseDialog = () => setCloseDialogOpen(true);
  const handleReopenDay = async () => {
    const ok = await confirm({
      title: 'Reopen the day for this store?',
      description: "It will accept new sales again until it's closed.",
      confirmLabel: 'Reopen Day',
    });
    if (ok) reopenDay.mutate();
  };

  const summary = data?.summary;
  const cashFlowRows = data?.cashFlowRows ?? [];
  const bankReconciliationRows = data?.bankReconciliationRows ?? [];

  const formatRowStamp = (value: string) =>
    new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  const downloadCsv = () => {
    if (!data) return;
    let header: string;
    let lines: string[];
    if (tab === 'cash-flow') {
      header = ['Date', 'Invoice #', 'Detail', 'Cash In', 'Cash Out', 'Balance'].join(',');
      lines = cashFlowRows.map((r) =>
        [
          new Date(r.date).toLocaleDateString(),
          r.voucherNo,
          r.description,
          r.cashIn,
          r.cashOut,
          r.balance,
        ]
          .map(csvEscape)
          .join(','),
      );
    } else {
      header = ['Date', 'Invoice #', 'Detail', 'Bank Name', 'Trans ID', 'Amount'].join(',');
      lines = bankReconciliationRows.map((r) =>
        [
          new Date(r.date).toLocaleDateString(),
          r.voucherNo,
          r.description,
          r.bankName,
          r.transactionId,
          r.amount,
        ]
          .map(csvEscape)
          .join(','),
      );
    }
    const csv = [header, ...lines].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `day-book-${tab}-${date}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const primaryCards = summary
    ? [
        {
          key: 'transactionCount',
          label: 'Total Transactions',
          value: summary.transactionCount,
          isCount: true,
          tone: 'destructive' as const,
        },
        {
          key: 'totalSales',
          label: 'Total Sales',
          value: summary.totalSales,
          tone: 'destructive' as const,
        },
        {
          key: 'totalExpenses',
          label: 'Total Expenses',
          value: summary.totalExpenses,
          tone: 'destructive' as const,
        },
      ]
    : [];

  // The report's netCash is just cash movement within the queried range — it
  // has no concept of a carried-forward opening balance. While the day is
  // open, the actual drawer balance is openingBalance + movement since open
  // (already combined server-side in dayEnd.cashOnHand); fall back to the
  // range's net movement only when there's no live open-session figure to
  // show (day closed, or viewing history).
  const cashOnHandValue =
    isBusinessDay && liveOpen && typeof live?.cashOnHand === 'number'
      ? live.cashOnHand
      : (summary?.netCash ?? 0);

  const cashCards = summary
    ? [
        {
          key: 'cashIn',
          label: 'Cash Received',
          value: summary.cashIn,
          tone: 'success' as const,
        },
        {
          key: 'bankIn',
          label: 'Bank Transfer',
          value: summary.bankIn,
          tone: 'success' as const,
        },
        {
          key: 'netCash',
          label: 'Cash On Hand',
          value: cashOnHandValue,
          tone: 'success' as const,
        },
      ]
    : [];

  return (
    <div className="space-y-4">
      <Card className="no-print">
        <CardContent className="flex flex-wrap items-end gap-3 p-4">
          <div className="space-y-1.5">
            <Label>Date</Label>
            <div className="flex items-center gap-1">
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="h-9 w-9"
                onClick={() => setDate((d) => shiftDate(d, -1))}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Input
                type="date"
                value={date}
                max={today}
                onChange={(e) => setDate(e.target.value)}
                className="w-40"
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="h-9 w-9"
                disabled={date >= today}
                onClick={() => setDate((d) => shiftDate(d, 1))}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
          {date !== businessDate && (
            <Button type="button" variant="outline" onClick={() => setDate(businessDate)}>
              {businessDate === today ? t('Today') : t('Open day')}
            </Button>
          )}
          {hasSpecificStore && dayEnd && (
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={cn(
                  'flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium',
                  dayEnd.isOpen
                    ? 'bg-success/10 text-success'
                    : 'bg-destructive/10 text-destructive',
                )}
              >
                {dayEnd.isOpen ? <Unlock className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
                {dayEnd.isOpen
                  ? isBusinessDay && live?.state === 'LATE_NIGHT'
                    ? `${t('Day is open')} — ${t('late night, entries go to')} ${formatDisplayDate(businessDate)}`
                    : t('Day is open')
                  : `${t('Closed by')} ${dayEnd.closedByName ?? ''}`.trim()}
              </span>
              {dayEnd.openedAt && (
                <span className="text-xs text-muted-foreground">
                  {t('Opened')}{' '}
                  {new Date(dayEnd.openedAt).toLocaleString([], {
                    day: '2-digit',
                    month: 'short',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                  {dayEnd.openedByName ? ` ${t('by')} ${dayEnd.openedByName}` : ''}
                </span>
              )}
              {!dayEnd.isOpen && typeof dayEnd.remainingBalance === 'number' && (
                <span className="text-xs text-muted-foreground">
                  {t('Submitted')} {formatCurrency(dayEnd.handoverAmount ?? 0)} ·{' '}
                  {t('Carried forward')} {formatCurrency(dayEnd.remainingBalance)}
                </span>
              )}
              {dayEnd.isOpen && !!dayEnd.openingBalance && (
                <span className="text-xs text-muted-foreground">
                  {t('Opening balance')} {formatCurrency(dayEnd.openingBalance)}
                </span>
              )}
              {isBusinessDay && liveOpen && canOpenClose && (
                <Button type="button" variant="outline" onClick={openCloseDialog}>
                  <Lock className="h-4 w-4" /> {t('Day End')}
                </Button>
              )}
              {date === today &&
                (live?.state === 'CLOSED' || live?.state === 'NONE') &&
                canOpenClose && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleOpenDay}
                    disabled={openDay.isPending}
                  >
                    <Unlock className="h-4 w-4" /> {t('Day Open')}
                  </Button>
                )}
              {isBusinessDay &&
                live?.state === 'CLOSED' &&
                live.openDate === today &&
                canReopen && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleReopenDay}
                    disabled={reopenDay.isPending}
                  >
                    <Unlock className="h-4 w-4" /> {t('Reopen Day')}
                  </Button>
                )}
            </div>
          )}
          <div className="ml-auto flex gap-2">
            <Button variant="outline" onClick={() => window.print()} disabled={!data}>
              <Printer className="h-4 w-4" /> {t('Print / PDF')}
            </Button>
            <Button
              onClick={downloadCsv}
              disabled={
                !data ||
                (tab === 'cash-flow'
                  ? cashFlowRows.length === 0
                  : bankReconciliationRows.length === 0)
              }
            >
              <Download className="h-4 w-4" /> {t('CSV')}
            </Button>
          </div>
        </CardContent>
      </Card>

      {summary && (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-3">
            {primaryCards.map((c) => (
              <Card
                key={c.key}
                className={cn(
                  'min-w-[160px] flex-1',
                  c.tone === 'destructive' && 'border-destructive/40',
                )}
              >
                <CardContent className="p-4">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">{c.label}</p>
                  <p
                    className={cn(
                      'text-lg font-bold',
                      c.tone === 'destructive' && 'text-destructive',
                    )}
                  >
                    {c.isCount ? c.value : formatCurrency(c.value)}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
          <div className="flex flex-wrap gap-3">
            {cashCards.map((c) => (
              <Card
                key={c.key}
                className={cn('min-w-[160px] flex-1', c.tone === 'success' && 'border-success/40')}
              >
                <CardContent className="p-4">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">{c.label}</p>
                  <p className={cn('text-lg font-bold', c.tone === 'success' && 'text-success')}>
                    {formatCurrency(c.value)}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      <div className="flex gap-1 rounded-lg bg-muted p-1 w-fit">
        {(
          [
            ['cash-flow', 'Cash Flow'],
            ['bank-reconciliation', 'Bank Reconciliation'],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={cn(
              'rounded-md px-3 py-1.5 text-sm font-medium transition',
              tab === key ? 'bg-background shadow-sm' : 'text-muted-foreground',
            )}
          >
            {t(label)}
          </button>
        ))}
      </div>

      {tab === 'cash-flow' && (
        <Card className="overflow-hidden">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BookText className="h-4 w-4" /> {t('Cash Flow')}
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              {`${t('Every cash movement posted on')} ${formatDisplayDate(date)} — ${t('click an entry for details')}`}
            </p>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-y bg-muted/50 text-left text-xs uppercase text-muted-foreground">
                    <th className="px-4 py-2 font-medium">{t('Date')}</th>
                    <th className="px-4 py-2 font-medium">{t('Invoice #')}</th>
                    <th className="px-4 py-2 font-medium">{t('Detail')}</th>
                    <th className="px-4 py-2 text-right font-medium">{t('Cash In')}</th>
                    <th className="px-4 py-2 text-right font-medium">{t('Cash Out')}</th>
                    <th className="px-4 py-2 text-right font-medium">{t('Balance')}</th>
                  </tr>
                </thead>
                <tbody>
                  {isLoading && (
                    <tr>
                      <td className="px-4 py-10 text-center text-muted-foreground" colSpan={6}>
                        Loading…
                      </td>
                    </tr>
                  )}
                  {!isLoading &&
                    cashFlowRows.map((r) => (
                      <tr
                        key={r.id}
                        className="cursor-pointer border-b last:border-0 hover:bg-muted/30"
                        onClick={() => setViewingEntryId(r.id)}
                      >
                        <td className="px-4 py-2 text-muted-foreground">
                          {formatRowStamp(r.date)}
                        </td>
                        <td className="px-4 py-2 text-muted-foreground">{r.voucherNo || '—'}</td>
                        <td className="px-4 py-2">{r.description}</td>
                        <td className="px-4 py-2 text-right tabular-nums text-success">
                          {r.cashIn ? formatCurrency(r.cashIn) : ''}
                        </td>
                        <td className="px-4 py-2 text-right tabular-nums text-destructive">
                          {r.cashOut ? formatCurrency(r.cashOut) : ''}
                        </td>
                        <td className="px-4 py-2 text-right tabular-nums font-medium">
                          {formatCurrency(r.balance)}
                        </td>
                      </tr>
                    ))}
                  {!isLoading && cashFlowRows.length === 0 && (
                    <tr>
                      <td className="px-4 py-10 text-center text-muted-foreground" colSpan={6}>
                        No cash movements recorded for this day.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {tab === 'bank-reconciliation' && (
        <Card className="overflow-hidden">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BookText className="h-4 w-4" /> {t('Bank Reconciliation')}
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              {`${t('Every bank transaction posted on')} ${formatDisplayDate(date)} — ${t('click an entry for details')}`}
            </p>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-y bg-muted/50 text-left text-xs uppercase text-muted-foreground">
                    <th className="px-4 py-2 font-medium">{t('Date')}</th>
                    <th className="px-4 py-2 font-medium">{t('Invoice #')}</th>
                    <th className="px-4 py-2 font-medium">{t('Detail')}</th>
                    <th className="px-4 py-2 font-medium">{t('Bank Name')}</th>
                    <th className="px-4 py-2 font-medium">{t('Trans ID')}</th>
                    <th className="px-4 py-2 text-right font-medium">{t('Amount')}</th>
                  </tr>
                </thead>
                <tbody>
                  {isLoading && (
                    <tr>
                      <td className="px-4 py-10 text-center text-muted-foreground" colSpan={6}>
                        Loading…
                      </td>
                    </tr>
                  )}
                  {!isLoading &&
                    bankReconciliationRows.map((r) => (
                      <tr
                        key={r.id}
                        className="cursor-pointer border-b last:border-0 hover:bg-muted/30"
                        onClick={() => setViewingEntryId(r.id)}
                      >
                        <td className="px-4 py-2 text-muted-foreground">
                          {formatRowStamp(r.date)}
                        </td>
                        <td className="px-4 py-2 text-muted-foreground">{r.voucherNo || '—'}</td>
                        <td className="px-4 py-2">{r.description}</td>
                        <td className="px-4 py-2 text-muted-foreground">{r.bankName || '—'}</td>
                        <td className="px-4 py-2 text-muted-foreground">
                          {r.transactionId || '—'}
                        </td>
                        <td
                          className={cn(
                            'px-4 py-2 text-right tabular-nums font-medium',
                            r.amount >= 0 ? 'text-success' : 'text-destructive',
                          )}
                        >
                          {formatCurrency(r.amount)}
                        </td>
                      </tr>
                    ))}
                  {!isLoading && bankReconciliationRows.length === 0 && (
                    <tr>
                      <td className="px-4 py-10 text-center text-muted-foreground" colSpan={6}>
                        No bank transactions recorded for this day.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {hasSpecificStore && (
        <DayEndCloseDialog
          open={closeDialogOpen}
          onOpenChange={setCloseDialogOpen}
          storeId={currentStoreId as string}
          cashOnHand={live?.cashOnHand ?? 0}
        />
      )}

      <DayBookEntryDialog entryId={viewingEntryId} onClose={() => setViewingEntryId(null)} />
    </div>
  );
}
