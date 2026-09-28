import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Pagination } from '@/components/ui/pagination';
import { api } from '@/lib/api';
import { cn, formatCurrency } from '@/lib/utils';
import { useStorefrontFilter } from '@/store/storefront';
import { useLanguage } from '@/components/language-provider';

type RowStatus = 'DIRECT' | 'PENDING' | 'PRICED';

export interface LabourCashFlowRow {
  saleId: string;
  saleNo: string;
  date: string;
  customerName: string;
  labour: string;
  labourName: string;
  serviceName: string;
  status: RowStatus;
  charged: number;
  payout: number | null;
  margin: number | null;
}

export interface LabourCashFlowSummary {
  charged: number;
  payout: number;
  margin: number;
  awaitingCharged: number;
  awaitingCount: number;
  paidToLabour: number;
  outstanding: number;
}

export interface LabourCashFlowResponse {
  rows: LabourCashFlowRow[];
  total: number;
  summary: LabourCashFlowSummary;
}

interface Labour {
  id: string;
  name: string;
}

const PAGE_SIZE = 25;

const STATUS_LABEL: Record<RowStatus, string> = {
  DIRECT: 'Direct',
  PENDING: 'Awaiting payout',
  PRICED: 'Payout set',
};

function StatusBadge({ status }: { status: RowStatus }) {
  const { t } = useLanguage();
  return (
    <span
      className={cn(
        'rounded-full px-2 py-0.5 text-xs font-medium',
        status === 'PENDING' && 'bg-amber-500/15 text-amber-700 dark:text-amber-400',
        status === 'PRICED' && 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400',
        status === 'DIRECT' && 'bg-muted text-muted-foreground',
      )}
    >
      {t(STATUS_LABEL[status])}
    </span>
  );
}

function Stat({ label, value, hint }: { label: string; value: number; hint?: string }) {
  return (
    <Card>
      <CardContent className="pt-5">
        <p className="text-xs uppercase text-muted-foreground">{label}</p>
        <p
          className={cn('mt-1 text-xl font-semibold tabular-nums', value < 0 && 'text-destructive')}
        >
          {formatCurrency(value)}
        </p>
        {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
      </CardContent>
    </Card>
  );
}

/** Summary tiles + per-line table for the labour cash flow. Shared by the
 * Labour Cash Flow page (all labourers) and a labourer's detail page. */
export function LabourCashFlowView({ labourId }: { labourId?: string }) {
  const { t } = useLanguage();
  const storefront = useStorefrontFilter();
  const [labour, setLabour] = useState(labourId ?? '');
  const [status, setStatus] = useState<RowStatus | ''>('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);

  useEffect(() => {
    setPage(1);
  }, [labour, status, from, to, storefront.store]);

  const { data: labourList = [] } = useQuery<Labour[]>({
    queryKey: ['labour'],
    queryFn: async () => (await api.get('/labour')).data,
    enabled: !labourId,
  });

  const { data, isLoading } = useQuery<LabourCashFlowResponse>({
    queryKey: ['labour-cash-flow', labour, status, from, to, page, storefront.store],
    queryFn: async () =>
      (
        await api.get('/finance/labour-cash-flow', {
          params: {
            labour: labour || undefined,
            status: status || undefined,
            from: from || undefined,
            to: to || undefined,
            page,
            limit: PAGE_SIZE,
            ...storefront,
          },
        })
      ).data,
  });
  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;
  const summary = data?.summary;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label={t('Charged to customers')}
          value={summary?.charged ?? 0}
          hint={t('Labour on sale invoices')}
        />
        <Stat
          label={t('Labour payout')}
          value={summary?.payout ?? 0}
          hint={t('Owed to labourers for these sales')}
        />
        <Stat
          label={t('Store margin')}
          value={summary?.margin ?? 0}
          hint={t('Charged minus payout')}
        />
        <Stat
          label={t('Awaiting payout')}
          value={summary?.awaitingCharged ?? 0}
          hint={`${summary?.awaitingCount ?? 0} ${t('line(s) charged, payout not set')}`}
        />
        <Stat
          label={t('Paid to labourers')}
          value={summary?.paidToLabour ?? 0}
          hint={t('Payments made in this period')}
        />
        <Stat
          label={t('Outstanding')}
          value={summary?.outstanding ?? 0}
          hint={t('Current labour ledger balance')}
        />
      </div>

      <div className="flex flex-wrap items-end gap-3">
        {!labourId && (
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">{t('Labourer')}</Label>
            <select
              value={labour}
              onChange={(e) => setLabour(e.target.value)}
              className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
            >
              <option value="">{t('All labourers')}</option>
              {labourList.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </div>
        )}
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs">{t('Status')}</Label>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as RowStatus | '')}
            className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
          >
            <option value="">{t('All')}</option>
            <option value="PENDING">{t('Awaiting payout')}</option>
            <option value="PRICED">{t('Payout set')}</option>
            <option value="DIRECT">{t('Direct')}</option>
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs">{t('From')}</Label>
          <Input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="h-9 w-40"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs">{t('To')}</Label>
          <Input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="h-9 w-40"
          />
        </div>
      </div>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-3 font-medium">{t('Date')}</th>
                <th className="px-4 py-3 font-medium">{t('Sale #')}</th>
                {!labourId && <th className="px-4 py-3 font-medium">{t('Labourer')}</th>}
                <th className="px-4 py-3 font-medium">{t('Service')}</th>
                <th className="px-4 py-3 font-medium">{t('Status')}</th>
                <th className="px-4 py-3 text-right font-medium">{t('Charged')}</th>
                <th className="px-4 py-3 text-right font-medium">{t('Labour Payout')}</th>
                <th className="px-4 py-3 text-right font-medium">{t('Store Margin')}</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-muted-foreground">
                    {t('Loading…')}
                  </td>
                </tr>
              )}
              {!isLoading &&
                rows.map((r, i) => (
                  <tr key={`${r.saleId}-${r.labour}-${i}`} className="border-b last:border-0">
                    <td className="px-4 py-3 text-muted-foreground">
                      {new Date(r.date).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3 font-medium">{r.saleNo}</td>
                    {!labourId && <td className="px-4 py-3">{r.labourName}</td>}
                    <td className="px-4 py-3 text-muted-foreground">{r.serviceName || '—'}</td>
                    <td className="px-4 py-3">
                      <StatusBadge status={r.status} />
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {formatCurrency(r.charged)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {r.payout !== null ? formatCurrency(r.payout) : '—'}
                    </td>
                    <td
                      className={cn(
                        'px-4 py-3 text-right tabular-nums font-medium',
                        r.margin !== null && r.margin < 0 && 'text-destructive',
                      )}
                    >
                      {r.margin !== null ? formatCurrency(r.margin) : '—'}
                    </td>
                  </tr>
                ))}
              {!isLoading && rows.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-muted-foreground">
                    {t('No labour charged on sales yet.')}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <Pagination
          page={page}
          totalPages={totalPages}
          total={total}
          pageSize={PAGE_SIZE}
          onPageChange={setPage}
          className="border-t"
        />
      </Card>
    </div>
  );
}

export function LabourCashFlowPage() {
  return <LabourCashFlowView />;
}
