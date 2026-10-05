import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { HardHat, Loader2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Combobox } from '@/components/product-combobox';
import { api } from '@/lib/api';
import { cn, formatCurrency } from '@/lib/utils';
import { useStorefrontFilter } from '@/store/storefront';
import { useLanguage } from '@/components/language-provider';

interface TrackableSale {
  id: string;
  number: string;
  date: string;
  customerName: string;
}

interface TrackPayment {
  id: string;
  number: string;
  date: string;
  amount: number;
  method: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
}

interface TrackWorker {
  labourId: string;
  name: string;
  phoneNumber: string;
  services: string[];
  charged: number;
  paid: number;
  payments: TrackPayment[];
}

interface TrackResult {
  sale: TrackableSale & { labourRent: number };
  workers: TrackWorker[];
  unassigned: { serviceName: string; phoneNumber: string; rent: number }[];
}

const METHOD_LABEL: Record<string, string> = {
  CASH: 'Cash',
  BANK_TRANSFER: 'Bank transfer',
  ONLINE: 'Online',
  CARD: 'Card',
};

/** Where a labourer stands on this invoice. Only approved payouts count as
 * paid; ones awaiting approval are shown alongside. */
function payStatus(w: TrackWorker) {
  const approved = w.payments
    .filter((p) => p.status === 'APPROVED')
    .reduce((s, p) => s + Number(p.amount || 0), 0);
  if (approved <= 0) return { label: 'Not paid', tone: 'destructive' as const, approved };
  if (w.charged > 0 && approved < w.charged)
    return { label: 'Partially paid', tone: 'warning' as const, approved };
  return { label: 'Paid', tone: 'success' as const, approved };
}

/**
 * Labour → Track: pick a sale invoice and see which labourers worked on it
 * and whether they've been paid for it (Labour expenses against the invoice).
 */
export function LabourTrackDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useLanguage();
  const storefront = useStorefrontFilter();
  const [search, setSearch] = useState('');
  const [sale, setSale] = useState<TrackableSale | null>(null);

  const { data: sales = [] } = useQuery<TrackableSale[]>({
    queryKey: ['labour-track-sales', storefront.store, search],
    queryFn: async () =>
      (
        await api.get('/labour/track/sales', {
          params: { ...storefront, search: search || undefined },
        })
      ).data,
    enabled: open,
  });

  const { data: result, isLoading } = useQuery<TrackResult>({
    queryKey: ['labour-track', sale?.id],
    queryFn: async () => (await api.get(`/labour/track/sales/${sale!.id}`)).data,
    enabled: open && !!sale,
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) {
          setSale(null);
          setSearch('');
        }
        onOpenChange(o);
      }}
    >
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t('Track Labour')}</DialogTitle>
          <DialogDescription>
            {t('Search an invoice to see who worked on it and whether they have been paid.')}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-1.5">
          <Label>{t('Invoice #')}</Label>
          <Combobox<TrackableSale>
            options={sales}
            getKey={(s) => s.id}
            getLabel={(s) => s.number}
            matches={(s, q) => s.customerName.toLowerCase().includes(q)}
            onQueryChange={setSearch}
            renderOption={(s) => (
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{s.number}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {s.customerName} · {new Date(s.date).toLocaleDateString()}
                </p>
              </div>
            )}
            selectedLabel={sale?.number ?? ''}
            onSelect={setSale}
            placeholder={t('Type invoice # to search…')}
            emptyText={t('No invoices found')}
            autoFocus
          />
        </div>

        {sale && isLoading && (
          <div className="flex justify-center py-8 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        )}

        {sale && result && (
          <div className="space-y-3">
            <div className="flex flex-wrap justify-between gap-2 rounded-md border bg-muted/30 px-3 py-2 text-sm">
              <span>
                <span className="font-medium">{result.sale.number}</span>
                <span className="text-muted-foreground">
                  {' '}
                  · {result.sale.customerName} · {new Date(result.sale.date).toLocaleDateString()}
                </span>
              </span>
              {result.sale.labourRent > 0 && (
                <span className="text-muted-foreground">
                  {t('Labour charged')}:{' '}
                  <span className="font-medium text-foreground">
                    {formatCurrency(result.sale.labourRent)}
                  </span>
                </span>
              )}
            </div>

            {result.workers.length === 0 ? (
              <div className="rounded-md border border-dashed px-4 py-8 text-center">
                <HardHat className="mx-auto mb-2 h-6 w-6 text-muted-foreground" />
                <p className="font-medium">{t('No Labour assigned to this invoice')}</p>
                {result.unassigned.length > 0 && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    {t('Labour was charged for')}{' '}
                    {result.unassigned.map((u) => u.serviceName || t('Labour')).join(', ')}{' '}
                    {t('but no labourer has been named or paid yet.')}
                  </p>
                )}
              </div>
            ) : (
              <div className="space-y-2">
                {result.workers.map((w) => {
                  const status = payStatus(w);
                  const pending = w.payments.filter((p) => p.status === 'PENDING');
                  return (
                    <div key={w.labourId} className="space-y-2 rounded-lg border p-3">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <p className="flex items-center gap-2 font-medium">
                            <HardHat className="h-4 w-4 text-muted-foreground" />
                            {w.name}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {[w.phoneNumber, w.services.join(', ')].filter(Boolean).join(' · ') ||
                              '—'}
                          </p>
                        </div>
                        <span
                          className={cn(
                            'rounded-full px-2 py-0.5 text-xs font-medium',
                            status.tone === 'success' && 'bg-success/10 text-success',
                            status.tone === 'warning' && 'bg-amber-500/10 text-amber-600',
                            status.tone === 'destructive' && 'bg-destructive/10 text-destructive',
                          )}
                        >
                          {t(status.label)}
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">
                        {w.charged > 0 && (
                          <div>
                            <p className="text-xs text-muted-foreground">{t('Charged')}</p>
                            <p className="tabular-nums">{formatCurrency(w.charged)}</p>
                          </div>
                        )}
                        <div>
                          <p className="text-xs text-muted-foreground">{t('Paid')}</p>
                          <p className="tabular-nums">{formatCurrency(status.approved)}</p>
                        </div>
                        {pending.length > 0 && (
                          <div>
                            <p className="text-xs text-muted-foreground">
                              {t('Awaiting approval')}
                            </p>
                            <p className="tabular-nums">
                              {formatCurrency(
                                pending.reduce((s, p) => s + Number(p.amount || 0), 0),
                              )}
                            </p>
                          </div>
                        )}
                      </div>
                      {w.payments.length > 0 && (
                        <ul className="space-y-1 border-t pt-2 text-xs text-muted-foreground">
                          {w.payments.map((p) => (
                            <li key={p.id} className="flex justify-between gap-2">
                              <span>
                                {p.number} · {new Date(p.date).toLocaleDateString()} ·{' '}
                                {t(METHOD_LABEL[p.method] ?? p.method)}
                                {p.status === 'PENDING' && ` · ${t('Pending')}`}
                              </span>
                              <span className="tabular-nums">{formatCurrency(p.amount)}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  );
                })}
                {result.unassigned.length > 0 && (
                  <p className="text-xs text-muted-foreground">
                    {t('Also charged with no labourer named')}:{' '}
                    {result.unassigned
                      .map((u) => `${u.serviceName || t('Labour')} (${formatCurrency(u.rent)})`)
                      .join(', ')}
                  </p>
                )}
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
