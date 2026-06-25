import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Download, Printer } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { api } from '@/lib/api';
import { cn, formatCurrency } from '@/lib/utils';

interface ReportResult {
  title: string;
  columns: { key: string; label: string; numeric?: boolean }[];
  rows: Record<string, any>[];
  summary: Record<string, number>;
}

const TYPES = [
  { key: 'sales', label: 'Sales' },
  { key: 'purchases', label: 'Purchases' },
  { key: 'stock', label: 'Stock Valuation' },
  { key: 'pnl', label: 'Profit & Loss' },
];

export function ReportsPage() {
  const [type, setType] = useState('sales');
  const today = new Date().toISOString().slice(0, 10);
  const monthAgo = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  const [from, setFrom] = useState(monthAgo);
  const [to, setTo] = useState(today);

  const { data, isLoading } = useQuery<ReportResult>({
    queryKey: ['report', type, from, to],
    queryFn: async () => (await api.get(`/reports/${type}`, { params: { from, to } })).data,
  });

  const downloadCsv = async () => {
    // Build the CSV client-side from the mock report data (no backend).
    const report = (await api.get(`/reports/${type}`, { params: { from, to } }))
      .data as ReportResult;
    const escape = (v: any) => {
      const s = String(v ?? '').replace(/"/g, '""');
      return /[",\n]/.test(s) ? `"${s}"` : s;
    };
    const header = report.columns.map((c) => c.label).join(',');
    const lines = report.rows.map((r) => report.columns.map((c) => escape(r[c.key])).join(','));
    const csv = [header, ...lines].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${type}-report.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const fmt = (col: { numeric?: boolean }, v: any) =>
    col.numeric && typeof v === 'number' ? formatCurrency(v) : String(v ?? '');

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="flex flex-wrap items-end gap-3 p-4">
          <div className="space-y-1.5">
            <Label>Report</Label>
            <div className="flex gap-1 rounded-lg bg-muted p-1">
              {TYPES.map((t) => (
                <button
                  key={t.key}
                  onClick={() => setType(t.key)}
                  className={cn(
                    'rounded-md px-3 py-1.5 text-sm font-medium transition',
                    type === t.key ? 'bg-background shadow-sm' : 'text-muted-foreground',
                  )}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>
          {type !== 'stock' && (
            <>
              <div className="space-y-1.5">
                <Label>From</Label>
                <Input
                  type="date"
                  value={from}
                  onChange={(e) => setFrom(e.target.value)}
                  className="w-40"
                />
              </div>
              <div className="space-y-1.5">
                <Label>To</Label>
                <Input
                  type="date"
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                  className="w-40"
                />
              </div>
            </>
          )}
          <div className="ml-auto flex gap-2">
            <Button variant="outline" onClick={() => window.print()}>
              <Printer className="h-4 w-4" /> Print / PDF
            </Button>
            <Button onClick={downloadCsv}>
              <Download className="h-4 w-4" /> CSV
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle>{data?.title ?? 'Report'}</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-y bg-muted/50 text-left text-xs uppercase text-muted-foreground">
                  {data?.columns.map((c) => (
                    <th
                      key={c.key}
                      className={cn('px-4 py-2 font-medium', c.numeric && 'text-right')}
                    >
                      {c.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {isLoading && (
                  <tr>
                    <td className="px-4 py-10 text-center text-muted-foreground" colSpan={99}>
                      Loading…
                    </td>
                  </tr>
                )}
                {!isLoading &&
                  data?.rows.map((r, i) => (
                    <tr key={i} className="border-b last:border-0 hover:bg-muted/30">
                      {data.columns.map((c) => (
                        <td
                          key={c.key}
                          className={cn('px-4 py-2', c.numeric && 'text-right tabular-nums')}
                        >
                          {fmt(c, r[c.key])}
                        </td>
                      ))}
                    </tr>
                  ))}
                {!isLoading && data && data.rows.length === 0 && (
                  <tr>
                    <td className="px-4 py-10 text-center text-muted-foreground" colSpan={99}>
                      No data for this range.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {data && (
        <div className="flex flex-wrap gap-3">
          {Object.entries(data.summary).map(([k, v]) => (
            <Card key={k} className="flex-1 min-w-[150px]">
              <CardContent className="p-4">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">{k}</p>
                <p className="text-lg font-bold">
                  {/count|products/i.test(k) ? v : formatCurrency(v)}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
