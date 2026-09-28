import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ArrowLeft, Banknote, Printer } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { api } from '@/lib/api';
import { cn, formatCurrency } from '@/lib/utils';
import { useStorefrontFilter } from '@/store/storefront';
import { useLanguage } from '@/components/language-provider';
import { PayTransportDialog } from '@/components/pay-transport-dialog';
import {
  openSaleInvoicePopup,
  openStockReceiptInvoicePopup,
  type SaleForInvoice,
  type StockReceiptForInvoice,
} from '@/lib/invoicePopup';

interface Transporter {
  id: string;
  name: string;
  phone?: string;
  vehicleNumber?: string;
  address?: string;
  outstanding: number;
}
interface LedgerRow {
  date: string;
  description?: string;
  debit: number;
  credit: number;
  balanceAfter: number;
}
interface SaleJob extends SaleForInvoice {
  id: string;
  saleNumber: string;
  date: string;
  transportFare: number;
}
interface ReceiptJob extends StockReceiptForInvoice {
  id: string;
  number: string;
  date: string;
  truckFare: number;
}

const TABS = ['statement', 'jobs'] as const;
type Tab = (typeof TABS)[number];
const TAB_LABEL: Record<Tab, string> = { statement: 'Statement', jobs: 'Jobs' };

export function TransporterDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { t } = useLanguage();
  const qc = useQueryClient();
  const storefront = useStorefrontFilter();
  const [tab, setTab] = useState<Tab>('statement');
  const [paying, setPaying] = useState(false);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const { data: transporters = [] } = useQuery<Transporter[]>({
    queryKey: ['transporters', storefront.store],
    queryFn: async () => (await api.get('/transporters', { params: storefront })).data,
  });
  const transporter = transporters.find((tr) => tr.id === id);

  const { data: ledger } = useQuery<{ balance: number; opening: number; entries: LedgerRow[] }>({
    queryKey: ['transporter-ledger', id, from, to, storefront.store],
    queryFn: async () =>
      (
        await api.get(`/transporters/${id}/ledger`, {
          params: { from: from || undefined, to: to || undefined, ...storefront },
        })
      ).data,
    enabled: !!id,
  });

  const { data: salesData, isLoading: salesLoading } = useQuery<{ sales: SaleJob[] }>({
    queryKey: ['transporter-sales', id, storefront.store],
    queryFn: async () =>
      (await api.get('/sales', { params: { transporterId: id, limit: 200, ...storefront } })).data,
    enabled: !!id && tab === 'jobs',
  });
  const { data: receiptsData, isLoading: receiptsLoading } = useQuery<{ receipts: ReceiptJob[] }>({
    queryKey: ['transporter-stock-receipts', id, storefront.store],
    queryFn: async () =>
      (
        await api.get('/stock-receipts', {
          params: { transporterId: id, limit: 200, ...storefront },
        })
      ).data,
    enabled: !!id && tab === 'jobs',
  });
  const jobsLoading = salesLoading || receiptsLoading;
  const jobs = [
    ...(salesData?.sales ?? []).map((s) => ({
      key: `sale-${s.id}`,
      kind: 'sale' as const,
      label: `Sale #${s.saleNumber}`,
      date: s.date,
      amount: s.transportFare,
      ref: s,
    })),
    ...(receiptsData?.receipts ?? []).map((r) => ({
      key: `receipt-${r.id}`,
      kind: 'receipt' as const,
      label: `Stock Receipt #${r.number}`,
      date: r.date,
      amount: r.truckFare,
      ref: r,
    })),
  ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const handlePrintSaleInvoice = async (sale: SaleJob) => {
    try {
      await openSaleInvoicePopup(sale);
    } catch {
      toast.error('Could not prepare the invoice');
    }
  };
  const handlePrintReceiptInvoice = async (receipt: ReceiptJob) => {
    try {
      await openStockReceiptInvoicePopup(receipt);
    } catch {
      toast.error('Could not prepare the invoice');
    }
  };

  if (!id) return null;

  return (
    <div className="space-y-4">
      <button
        onClick={() => navigate('/transporters')}
        className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> {t('Back to Transporters')}
      </button>

      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-4 pt-6">
          <div>
            <CardTitle className="text-xl">{transporter?.name ?? '…'}</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              {[transporter?.phone, transporter?.vehicleNumber, transporter?.address]
                .filter(Boolean)
                .join(' · ') || t('No contact details')}
            </p>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right">
              <p className="text-xs uppercase text-muted-foreground">{t('Outstanding')}</p>
              <p className="text-lg font-semibold">
                {formatCurrency(transporter?.outstanding ?? 0)}
              </p>
            </div>
            <Button onClick={() => setPaying(true)} disabled={!transporter}>
              <Banknote className="h-4 w-4" /> {t('Pay Transport')}
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
            <CardTitle className="text-base">{t('Statement')}</CardTitle>
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
          <CardContent className={cn('p-0')}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-y bg-muted/50 text-left text-xs uppercase text-muted-foreground">
                    <th className="px-4 py-2 font-medium">{t('Date')}</th>
                    <th className="px-4 py-2 font-medium">{t('Description')}</th>
                    <th className="px-4 py-2 text-right font-medium">{t('Out')}</th>
                    <th className="px-4 py-2 text-right font-medium">{t('In')}</th>
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
            </div>
          </CardContent>
        </Card>
      )}

      {tab === 'jobs' && (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-3 font-medium">{t('Source')}</th>
                  <th className="px-4 py-3 font-medium">{t('Date')}</th>
                  <th className="px-4 py-3 text-right font-medium">{t('Amount')}</th>
                  <th className="px-4 py-3 text-right font-medium">{t('Actions')}</th>
                </tr>
              </thead>
              <tbody>
                {jobsLoading && (
                  <tr>
                    <td colSpan={4} className="px-4 py-10 text-center text-muted-foreground">
                      {t('Loading…')}
                    </td>
                  </tr>
                )}
                {!jobsLoading &&
                  jobs.map((j) => (
                    <tr key={j.key} className="border-b last:border-0 hover:bg-muted/30">
                      <td className="px-4 py-3 font-medium">{j.label}</td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {new Date(j.date).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {formatCurrency(j.amount)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          title={t('Print Invoice')}
                          onClick={() =>
                            j.kind === 'sale'
                              ? handlePrintSaleInvoice(j.ref)
                              : handlePrintReceiptInvoice(j.ref)
                          }
                        >
                          <Printer className="h-4 w-4" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                {!jobsLoading && jobs.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-4 py-10 text-center text-muted-foreground">
                      {t('No jobs for this transporter yet.')}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <PayTransportDialog
        transporter={
          transporter
            ? { id: transporter.id, name: transporter.name, outstanding: transporter.outstanding }
            : null
        }
        open={paying}
        onOpenChange={(o) => {
          setPaying(o);
          if (!o) qc.invalidateQueries({ queryKey: ['transporter-ledger', id] });
        }}
      />
    </div>
  );
}
