import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { BookText, ChevronLeft, ChevronRight, Download, Lock, Printer, Unlock } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { api } from '@/lib/api';
import { cn, formatCurrency } from '@/lib/utils';
import { useStorefrontFilter, useStorefrontStore } from '@/store/storefront';
import { useAuthStore } from '@/store/auth';
import { useLanguage } from '@/components/language-provider';

interface DayEndStatus {
  isOpen: boolean;
  closedByName?: string;
  closedAt?: string;
  reopenedByName?: string;
  reopenedAt?: string;
}
const MANAGER_ROLES = ['MANAGER', 'ADMIN', 'SUPER_ADMIN'];

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
}

// Money in vs money out vs neutral stock/adjustment vouchers, so the type
// pill gives a reader an at-a-glance read before they even check the amount.
const VOUCHER_STYLES: Record<string, string> = {
  SALE: 'bg-success/10 text-success',
  RECEIPT: 'bg-success/10 text-success',
  EXPENSE: 'bg-destructive/10 text-destructive',
  PAYMENT: 'bg-destructive/10 text-destructive',
  SALE_RETURN: 'bg-primary/10 text-primary',
  PURCHASE: 'bg-primary/10 text-primary',
  CASH_ADJUST: 'bg-muted text-muted-foreground',
  OPENING: 'bg-muted text-muted-foreground',
};

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

function csvEscape(v: unknown) {
  const s = String(v ?? '').replace(/"/g, '""');
  return /[",\n]/.test(s) ? `"${s}"` : s;
}

export function DayBookPage() {
  const { t } = useLanguage();
  const qc = useQueryClient();
  const [date, setDate] = useState(todayStr);
  const today = todayStr();
  const storefront = useStorefrontFilter();
  const currentStoreId = useStorefrontStore((s) => s.currentStoreId);
  const hasSpecificStore = !!currentStoreId && currentStoreId !== 'ALL';
  const role = useAuthStore((s) => s.user?.role);
  const canClose = !!role && MANAGER_ROLES.includes(role);
  const canReopen = role === 'SUPER_ADMIN';

  const { data, isLoading } = useQuery<DayBookResult>({
    queryKey: ['day-book', date, storefront.store],
    queryFn: async () =>
      (await api.get('/reports/day-book', { params: { from: date, to: date, ...storefront } }))
        .data,
  });

  const { data: dayEnd } = useQuery<DayEndStatus>({
    queryKey: ['day-end', currentStoreId, date],
    queryFn: async () =>
      (await api.get('/day-end', { params: { store: currentStoreId, date } })).data,
    enabled: hasSpecificStore,
  });

  const invalidateDayEnd = () =>
    qc.invalidateQueries({ queryKey: ['day-end', currentStoreId, date] });

  const closeDay = useMutation({
    mutationFn: async () =>
      (await api.post('/day-end/close', { store: currentStoreId, date })).data,
    onSuccess: () => {
      toast.success('Day closed');
      invalidateDayEnd();
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'Could not close the day'),
  });

  const reopenDay = useMutation({
    mutationFn: async () =>
      (await api.post('/day-end/reopen', { store: currentStoreId, date })).data,
    onSuccess: () => {
      toast.success('Day reopened');
      invalidateDayEnd();
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'Could not reopen the day'),
  });

  const handleCloseDay = () => {
    if (
      window.confirm(
        `Close ${date} for this store? No one except a super admin will be able to add new sales for this date until it's reopened.`,
      )
    ) {
      closeDay.mutate();
    }
  };
  const handleReopenDay = () => {
    if (window.confirm(`Reopen ${date} for this store?`)) reopenDay.mutate();
  };

  const rows = data?.rows ?? [];
  const summary = data?.summary;

  const downloadCsv = () => {
    if (!data) return;
    const header = ['Time', 'Type', 'Voucher #', 'Description', 'Warehouse', 'Amount'].join(',');
    const lines = rows.map((r) =>
      [
        new Date(r.date).toLocaleTimeString(),
        r.voucherLabel,
        r.voucherNo,
        r.description,
        r.warehouse,
        r.amount,
      ]
        .map(csvEscape)
        .join(','),
    );
    const csv = [header, ...lines].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `day-book-${date}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const cards = summary
    ? [
        {
          key: 'totalExpenses',
          label: 'Total Expenses',
          value: summary.totalExpenses,
          emphasize: true,
        },
        { key: 'totalSales', label: 'Total Sales', value: summary.totalSales },
        { key: 'totalPurchases', label: 'Total Purchases', value: summary.totalPurchases },
        {
          key: 'totalVendorPayments',
          label: 'Vendor Payments',
          value: summary.totalVendorPayments,
        },
        {
          key: 'totalCustomerReceipts',
          label: 'Customer Receipts',
          value: summary.totalCustomerReceipts,
        },
        { key: 'netCash', label: 'Net Cash Movement', value: summary.netCash },
        { key: 'netBank', label: 'Net Bank Movement', value: summary.netBank },
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
          {date !== today && (
            <Button type="button" variant="outline" onClick={() => setDate(today)}>
              {t('Today')}
            </Button>
          )}
          {hasSpecificStore && dayEnd && (
            <div className="flex items-center gap-2">
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
                  ? t('Day is open')
                  : `${t('Closed by')} ${dayEnd.closedByName ?? ''}`.trim()}
              </span>
              {dayEnd.isOpen && canClose && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleCloseDay}
                  disabled={closeDay.isPending}
                >
                  <Lock className="h-4 w-4" /> {t('Day End')}
                </Button>
              )}
              {!dayEnd.isOpen && canReopen && (
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
            <Button onClick={downloadCsv} disabled={!data || rows.length === 0}>
              <Download className="h-4 w-4" /> {t('CSV')}
            </Button>
          </div>
        </CardContent>
      </Card>

      {summary && (
        <div className="flex flex-wrap gap-3">
          {cards.map((c) => (
            <Card
              key={c.key}
              className={cn('min-w-[160px] flex-1', c.emphasize && 'border-destructive/40')}
            >
              <CardContent className="p-4">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">{c.label}</p>
                <p className={cn('text-lg font-bold', c.emphasize && 'text-destructive')}>
                  {formatCurrency(c.value)}
                </p>
              </CardContent>
            </Card>
          ))}
          <Card className="min-w-[160px] flex-1">
            <CardContent className="p-4">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Transactions</p>
              <p className="text-lg font-bold">{summary.transactionCount}</p>
            </CardContent>
          </Card>
        </div>
      )}

      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BookText className="h-4 w-4" /> Day Book
          </CardTitle>
          <p className="text-sm text-muted-foreground">Every transaction posted on {date}</p>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-y bg-muted/50 text-left text-xs uppercase text-muted-foreground">
                  <th className="px-4 py-2 font-medium">{t('Time')}</th>
                  <th className="px-4 py-2 font-medium">{t('Type')}</th>
                  <th className="px-4 py-2 font-medium">{t('Voucher #')}</th>
                  <th className="px-4 py-2 font-medium">{t('Description')}</th>
                  <th className="px-4 py-2 font-medium">{t('Warehouse')}</th>
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
                  rows.map((r) => (
                    <tr key={r.id} className="border-b last:border-0 hover:bg-muted/30">
                      <td className="px-4 py-2 text-muted-foreground">
                        {new Date(r.date).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </td>
                      <td className="px-4 py-2">
                        <span
                          className={cn(
                            'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
                            VOUCHER_STYLES[r.voucherType] ?? 'bg-muted text-muted-foreground',
                          )}
                        >
                          {r.voucherLabel}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-muted-foreground">{r.voucherNo || '—'}</td>
                      <td className="px-4 py-2">{r.description}</td>
                      <td className="px-4 py-2 text-muted-foreground">{r.warehouse || '—'}</td>
                      <td className="px-4 py-2 text-right tabular-nums font-medium">
                        {formatCurrency(r.amount)}
                      </td>
                    </tr>
                  ))}
                {!isLoading && rows.length === 0 && (
                  <tr>
                    <td className="px-4 py-10 text-center text-muted-foreground" colSpan={6}>
                      No transactions recorded for this day.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
