import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Banknote, Printer } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { api } from '@/lib/api';
import { cn, formatCurrency } from '@/lib/utils';
import { useStorefrontFilter } from '@/store/storefront';
import { useLanguage } from '@/components/language-provider';
import { PayLabourDialog } from '@/components/pay-labour-dialog';
import { openLabourInvoicePopup } from '@/lib/invoicePopup';

interface Labour {
  id: string;
  name: string;
  phoneNumber: string;
  outstanding: number;
}
interface LedgerRow {
  date: string;
  description?: string;
  debit: number;
  credit: number;
  balanceAfter: number;
}
interface SaleRow {
  id: string;
  saleNumber: string;
  date: string;
  labour?: { id: string; rent: number }[];
}
interface StockReceiptRow {
  id: string;
  number: string;
  date: string;
  labour: { labourId: string; rent: number }[];
}
interface Job {
  key: string;
  sourceLabel: string;
  date: string;
  rent: number;
}

const TABS = ['statement', 'jobs'] as const;
type Tab = (typeof TABS)[number];
const TAB_LABEL: Record<Tab, string> = { statement: 'Statement', jobs: 'Jobs' };

export function LabourDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { t } = useLanguage();
  const qc = useQueryClient();
  const storefront = useStorefrontFilter();
  const [tab, setTab] = useState<Tab>('statement');
  const [paying, setPaying] = useState(false);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const { data: labourList = [] } = useQuery<Labour[]>({
    queryKey: ['labour'],
    queryFn: async () => (await api.get('/labour')).data,
  });
  const labour = labourList.find((l) => l.id === id);

  const { data: ledger } = useQuery<{ balance: number; opening: number; entries: LedgerRow[] }>({
    queryKey: ['labour-ledger', id, from, to, storefront.store],
    queryFn: async () =>
      (
        await api.get(`/labour/${id}/ledger`, {
          params: { from: from || undefined, to: to || undefined, ...storefront },
        })
      ).data,
    enabled: !!id && tab === 'statement',
  });

  const { data: salesData, isLoading: salesLoading } = useQuery<{ sales: SaleRow[] }>({
    queryKey: ['labour-sales', id, storefront.store],
    queryFn: async () =>
      (await api.get('/sales', { params: { labourId: id, limit: 200, ...storefront } })).data,
    enabled: !!id && tab === 'jobs',
  });
  const { data: receiptsData, isLoading: receiptsLoading } = useQuery<{
    receipts: StockReceiptRow[];
  }>({
    queryKey: ['labour-stock-receipts', id, storefront.store],
    queryFn: async () =>
      (await api.get('/stock-receipts', { params: { labourId: id, limit: 200, ...storefront } }))
        .data,
    enabled: !!id && tab === 'jobs',
  });

  const jobsLoading = salesLoading || receiptsLoading;
  const jobs: Job[] = [
    ...(salesData?.sales ?? []).flatMap((s) =>
      (s.labour ?? [])
        .filter((l) => l.id === id)
        .map((l) => ({
          key: `sale-${s.id}`,
          sourceLabel: `Sale #${s.saleNumber}`,
          date: s.date,
          rent: l.rent,
        })),
    ),
    ...(receiptsData?.receipts ?? []).flatMap((r) =>
      (r.labour ?? [])
        .filter((l) => l.labourId === id)
        .map((l) => ({
          key: `receipt-${r.id}`,
          sourceLabel: `Stock Receipt #${r.number}`,
          date: r.date,
          rent: l.rent,
        })),
    ),
  ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const handlePrintStatement = async () => {
    const win = window.open('', '_blank', 'width=850,height=1000');
    win?.document.write(
      '<p style="font-family:sans-serif;padding:24px;color:#666">Preparing statement…</p>',
    );
    try {
      await openLabourInvoicePopup(
        {
          labourName: labour?.name ?? '',
          jobs: jobs.map((j) => ({ sourceLabel: j.sourceLabel, date: j.date, rent: j.rent })),
        },
        win,
      );
    } catch {
      toast.error('Enable popups to view the printable statement');
    }
  };

  if (!id) return null;

  return (
    <div className="space-y-4">
      <button
        onClick={() => navigate('/labour')}
        className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> {t('Back to Labour')}
      </button>

      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-4 pt-6">
          <div>
            <CardTitle className="text-xl">{labour?.name ?? '…'}</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">{labour?.phoneNumber}</p>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right">
              <p className="text-xs uppercase text-muted-foreground">{t('Outstanding')}</p>
              <p className="text-lg font-semibold">{formatCurrency(labour?.outstanding ?? 0)}</p>
            </div>
            <Button onClick={() => setPaying(true)} disabled={!labour}>
              <Banknote className="h-4 w-4" /> {t('Pay Labour')}
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="flex gap-1 rounded-lg bg-muted p-1 w-fit">
        {TABS.map((tabKey) => (
          <button
            key={tabKey}
            onClick={() => setTab(tabKey)}
            className={cn(
              'rounded-md px-3 py-1.5 text-sm font-medium transition',
              tab === tabKey ? 'bg-background shadow-sm' : 'text-muted-foreground',
            )}
          >
            {t(TAB_LABEL[tabKey])}
          </button>
        ))}
      </div>

      {tab === 'statement' && (
        <Card>
          <CardHeader className="flex flex-row flex-wrap items-end justify-between gap-4 space-y-0">
            <p className="text-sm text-muted-foreground">
              {from && (
                <>
                  {t('Opening balance')}:{' '}
                  <span className="font-medium text-foreground">
                    {formatCurrency(ledger?.opening ?? 0)}
                  </span>{' '}
                  ·{' '}
                </>
              )}
              {from || to ? t('Closing balance') : t('Current balance')}:{' '}
              <span className="font-semibold text-foreground">
                {formatCurrency(ledger?.balance ?? 0)}
              </span>
            </p>
            <div className="flex items-end gap-2">
              <div className="space-y-1.5">
                <Label className="text-xs">{t('From')}</Label>
                <Input
                  type="date"
                  value={from}
                  onChange={(e) => setFrom(e.target.value)}
                  className="h-8 w-36 text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">{t('To')}</Label>
                <Input
                  type="date"
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                  className="h-8 w-36 text-sm"
                />
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-y bg-muted/50 text-left text-xs uppercase text-muted-foreground">
                  <th className="px-4 py-2 font-medium">{t('Date')}</th>
                  <th className="px-4 py-2 font-medium">{t('Description')}</th>
                  <th className="px-4 py-2 text-right font-medium">{t('Debit')}</th>
                  <th className="px-4 py-2 text-right font-medium">{t('Credit')}</th>
                  <th className="px-4 py-2 text-right font-medium">{t('Balance')}</th>
                </tr>
              </thead>
              <tbody>
                {(ledger?.entries ?? []).map((e, i) => (
                  <tr key={i} className="border-b last:border-0">
                    <td className="px-4 py-2 text-muted-foreground">
                      {new Date(e.date).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-2">{e.description ?? '—'}</td>
                    <td className="px-4 py-2 text-right">
                      {e.debit ? formatCurrency(e.debit) : ''}
                    </td>
                    <td className="px-4 py-2 text-right">
                      {e.credit ? formatCurrency(e.credit) : ''}
                    </td>
                    <td className="px-4 py-2 text-right font-medium">
                      {formatCurrency(e.balanceAfter)}
                    </td>
                  </tr>
                ))}
                {ledger && ledger.entries.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-10 text-center text-muted-foreground">
                      {t('No transactions yet.')}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {tab === 'jobs' && (
        <Card className="overflow-hidden">
          <div className="flex items-center justify-end border-b p-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handlePrintStatement}
              disabled={jobs.length === 0}
            >
              <Printer className="h-4 w-4" /> {t('Print Invoice')}
            </Button>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-3 font-medium">{t('Source')}</th>
                <th className="px-4 py-3 font-medium">{t('Date')}</th>
                <th className="px-4 py-3 text-right font-medium">{t('Amount')}</th>
              </tr>
            </thead>
            <tbody>
              {jobsLoading && (
                <tr>
                  <td colSpan={3} className="px-4 py-10 text-center text-muted-foreground">
                    {t('Loading…')}
                  </td>
                </tr>
              )}
              {!jobsLoading &&
                jobs.map((j) => (
                  <tr key={j.key} className="border-b last:border-0 hover:bg-muted/30">
                    <td className="px-4 py-3 font-medium">{j.sourceLabel}</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {new Date(j.date).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">{formatCurrency(j.rent)}</td>
                  </tr>
                ))}
              {!jobsLoading && jobs.length === 0 && (
                <tr>
                  <td colSpan={3} className="px-4 py-10 text-center text-muted-foreground">
                    {t('No jobs for this labourer yet.')}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </Card>
      )}

      <PayLabourDialog
        labour={
          labour ? { id: labour.id, name: labour.name, outstanding: labour.outstanding } : null
        }
        open={paying}
        onOpenChange={(o) => {
          setPaying(o);
          if (!o) qc.invalidateQueries({ queryKey: ['labour-ledger', id] });
        }}
      />
    </div>
  );
}
