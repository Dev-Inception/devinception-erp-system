import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { BookText, ChevronLeft, ChevronRight, Download, Printer } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { api } from '@/lib/api';
import { cn, formatCurrency } from '@/lib/utils';
import { useStorefrontFilter } from '@/store/storefront';

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

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function shiftDate(date: string, days: number) {
  const d = new Date(`${date}T00:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function csvEscape(v: unknown) {
  const s = String(v ?? '').replace(/"/g, '""');
  return /[",\n]/.test(s) ? `"${s}"` : s;
}

export function DayBookPage() {
  const [date, setDate] = useState(todayStr);
  const today = todayStr();
  const storefront = useStorefrontFilter();

  const { data, isLoading } = useQuery<DayBookResult>({
    queryKey: ['day-book', date, storefront.store],
    queryFn: async () =>
      (await api.get('/reports/day-book', { params: { from: date, to: date, ...storefront } }))
        .data,
  });

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
              Today
            </Button>
          )}
          <div className="ml-auto flex gap-2">
            <Button variant="outline" onClick={() => window.print()} disabled={!data}>
              <Printer className="h-4 w-4" /> Print / PDF
            </Button>
            <Button onClick={downloadCsv} disabled={!data || rows.length === 0}>
              <Download className="h-4 w-4" /> CSV
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
                  <th className="px-4 py-2 font-medium">Time</th>
                  <th className="px-4 py-2 font-medium">Type</th>
                  <th className="px-4 py-2 font-medium">Voucher #</th>
                  <th className="px-4 py-2 font-medium">Description</th>
                  <th className="px-4 py-2 font-medium">Warehouse</th>
                  <th className="px-4 py-2 text-right font-medium">Amount</th>
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
