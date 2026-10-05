import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { BookText, Download, Printer } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';
import { grantsPermission } from '@/lib/modules';
import { cn, formatCurrency } from '@/lib/utils';
import { useStorefrontFilter, useStorefrontStore } from '@/store/storefront';
import { useAuthStore } from '@/store/auth';
import { useHeaderDate, localDateStr } from '@/store/workingDate';
import { useLanguage } from '@/components/language-provider';
import { DayBookEntryDialog } from '@/components/day-book-entry-dialog';
import { CashEntryDialog } from '@/components/cash-entry-dialog';

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
  // The day's opening cash in hand (from Day Open) — not a journal entry.
  isOpening?: boolean;
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
  // Cash in hand the day was opened with (0 if it wasn't opened that day),
  // and that plus the day's net cash movement.
  openingBalance: number;
  cashOnHand: number;
}

interface DayBookResult {
  title: string;
  rows: DayBookRow[];
  summary: DayBookSummary;
  cashFlowRows: CashFlowRow[];
  bankReconciliationRows: BankReconciliationRow[];
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
  const [tab, setTab] = useState<'cash-flow' | 'bank-reconciliation'>('cash-flow');
  const [viewingEntryId, setViewingEntryId] = useState<string | null>(null);
  const storefront = useStorefrontFilter();
  const currentStoreId = useStorefrontStore((s) => s.currentStoreId);
  const hasSpecificStore = !!currentStoreId && currentStoreId !== 'ALL';
  const authUser = useAuthStore((s) => s.user);
  const canRecordCash = grantsPermission(authUser?.permissions, 'finance:manage');

  // The store's live day state (no date): which business day is open right
  // now, even past midnight. Shared cache key with StaleDayGuard.
  const { data: live } = useQuery<DayEndStatus>({
    queryKey: ['day-end-live', currentStoreId],
    queryFn: async () => (await api.get('/day-end', { params: { store: currentStoreId } })).data,
    enabled: hasSpecificStore,
  });

  // No date filter of its own: opening/closing the day and picking a past
  // date both live in the header (DayControl), and the Day Book shows that
  // date — the open business day by default, so after midnight a day opened
  // yesterday still shows yesterday.
  const date = useHeaderDate();

  // The day currently being traded (open or not).
  const businessDate = live?.businessDate ?? localDateStr();
  const isBusinessDay = date === businessDate;
  const liveOpen = !!live?.isOpen && live.state !== 'NONE';

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

  // While the day is open, the actual drawer balance is openingBalance +
  // movement since open (combined server-side in dayEnd.cashOnHand, which
  // also spans midnights). Otherwise use the report's figure: the cash in
  // hand the day was opened with (if it was opened on this date) plus the
  // day's net cash movement.
  const cashOnHandValue =
    isBusinessDay && liveOpen && typeof live?.cashOnHand === 'number'
      ? live.cashOnHand
      : (summary?.cashOnHand ?? summary?.netCash ?? 0);

  const cashCards = summary
    ? [
        {
          key: 'openingBalance',
          label: 'Opening Balance',
          value: summary.openingBalance ?? 0,
          tone: 'success' as const,
        },
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
        <CardContent className="flex flex-wrap items-center gap-3 p-4">
          <p className="text-sm font-medium">{formatDisplayDate(date)}</p>
          <div className="ml-auto flex gap-2">
            {canRecordCash && <CashEntryDialog />}
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
                        className={cn(
                          'border-b last:border-0',
                          r.isOpening
                            ? 'bg-muted/20 font-medium'
                            : 'cursor-pointer hover:bg-muted/30',
                        )}
                        onClick={r.isOpening ? undefined : () => setViewingEntryId(r.id)}
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

      <DayBookEntryDialog entryId={viewingEntryId} onClose={() => setViewingEntryId(null)} />
    </div>
  );
}
