import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2, Search } from 'lucide-react';
import { toast } from 'sonner';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Pagination } from '@/components/ui/pagination';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { cn, formatCurrency } from '@/lib/utils';
import { api } from '@/lib/api';
import { useAuthStore } from '@/store/auth';
import { grantsPermission } from '@/lib/modules';
import { useLanguage } from '@/components/language-provider';

type SourceType = 'SALE_ITEM' | 'STOCK_RECEIPT_ITEM';

interface PendingInvoice {
  id: string;
  sourceType: SourceType;
  sourceNo: string;
  vendorName: string;
  storeName?: string;
  warehouseName?: string;
  date: string;
  itemCount: number;
  pricedCount: number;
  status: 'PENDING' | 'PRICED';
  total?: number;
}

interface InvoiceItem {
  id: string;
  sourceType: SourceType;
  sourceNo: string;
  vendorName: string;
  productName: string;
  quantity: number;
  storeName?: string;
  warehouseName?: string;
  date: string;
  status: 'PENDING' | 'PRICED';
  purchasePrice?: number;
  lineTotal?: number;
}

const PAGE_SIZE = 20;

function sourceLabel(t: (s: string) => string, sourceType: SourceType) {
  return sourceType === 'SALE_ITEM' ? t('Sale (vendor item)') : t('Stock receipt');
}

/** One row of an invoice's item table: product, quantity and — for those who
 * can price it — a purchase-price input. The price itself is held in the
 * parent dialog's state and saved for every priced row at once via the
 * dialog's single Save/Update button, rather than each row posting on its
 * own. */
function InvoiceItemRow({
  item,
  canPrice,
  price,
  onPriceChange,
}: {
  item: InvoiceItem;
  canPrice: boolean;
  price: string;
  onPriceChange: (id: string, value: string) => void;
}) {
  const { t } = useLanguage();
  const editing = item.status === 'PRICED';
  const enteredPrice = Number(price);
  const hasEnteredPrice = price.trim() !== '' && Number.isFinite(enteredPrice) && enteredPrice > 0;
  const lineTotal = hasEnteredPrice
    ? enteredPrice * item.quantity
    : editing
      ? (item.lineTotal ?? 0)
      : null;

  return (
    <tr className="border-b last:border-0">
      <td className="px-3 py-2">{item.productName}</td>
      <td className="px-3 py-2 text-right tabular-nums">{item.quantity}</td>
      <td className="px-3 py-2 text-right">
        {canPrice ? (
          <Input
            type="number"
            min={0.01}
            step="0.01"
            value={price}
            onChange={(e) => onPriceChange(item.id, e.target.value)}
            placeholder="0.00"
            className="ml-auto h-8 w-28 text-right"
          />
        ) : editing ? (
          formatCurrency(item.purchasePrice ?? 0)
        ) : (
          <span className="text-muted-foreground">{t('Awaiting price')}</span>
        )}
      </td>
      <td className="px-3 py-2 text-right tabular-nums">
        {lineTotal !== null ? formatCurrency(lineTotal) : '—'}
      </td>
    </tr>
  );
}

// Live line total for a row: the price currently typed (even if unsaved)
// times quantity, falling back to the last-saved amount once priced.
function effectiveLineTotal(item: InvoiceItem, price: string | undefined) {
  const entered = Number(price);
  if (price !== undefined && price.trim() !== '' && Number.isFinite(entered) && entered > 0) {
    return entered * item.quantity;
  }
  return item.status === 'PRICED' ? (item.lineTotal ?? 0) : 0;
}

/** One invoice/receipt's full line-item breakdown, opened from a row in the
 * pending-entities table. Every item gets its own purchase-price input right
 * next to it, so a multi-item invoice can be priced line-by-line in one
 * place instead of hunting down each item separately. Works the same for
 * the Pending and Completed tabs — the items just start out already priced
 * on the Completed side. */
function InvoiceItemsDialog({
  invoice,
  canPrice,
  onClose,
}: {
  invoice: PendingInvoice;
  canPrice: boolean;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const { t } = useLanguage();

  const { data, isLoading } = useQuery({
    queryKey: ['pending-invoice-items', invoice.sourceType, invoice.sourceNo],
    queryFn: async () =>
      (
        await api.get('/pending-entities/invoice-items', {
          params: { sourceType: invoice.sourceType, sourceNo: invoice.sourceNo },
        })
      ).data as { items: InvoiceItem[] },
  });
  const items = data?.items ?? [];

  const [prices, setPrices] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!data) return;
    setPrices((prev) => {
      const next = { ...prev };
      for (const it of data.items) {
        if (next[it.id] === undefined) {
          next[it.id] = it.purchasePrice !== undefined ? String(it.purchasePrice) : '';
        }
      }
      return next;
    });
  }, [data]);

  const refresh = () => {
    qc.invalidateQueries({
      queryKey: ['pending-invoice-items', invoice.sourceType, invoice.sourceNo],
    });
    qc.invalidateQueries({ queryKey: ['pending-invoices'] });
    qc.invalidateQueries({ queryKey: ['vendors'] });
  };

  const save = useMutation({
    mutationFn: async () => {
      const updates = items
        .map((it) => ({ id: it.id, purchasePrice: Number(prices[it.id]) }))
        .filter((u) => Number.isFinite(u.purchasePrice) && u.purchasePrice > 0);
      if (updates.length === 0) throw new Error(t('Enter at least one purchase price'));
      await Promise.all(
        updates.map((u) =>
          api.patch(`/pending-entities/${u.id}/price`, { purchasePrice: u.purchasePrice }),
        ),
      );
    },
    onSuccess: () => {
      toast.success(t('Purchase price(s) saved'));
      refresh();
    },
    onError: (e: any) =>
      toast.error(e?.response?.data?.message ?? e?.message ?? t('Could not save prices')),
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{invoice.sourceNo}</DialogTitle>
          <DialogDescription>
            {sourceLabel(t, invoice.sourceType)} · {new Date(invoice.date).toLocaleDateString()} ·{' '}
            {invoice.vendorName}
          </DialogDescription>
        </DialogHeader>

        {(invoice.storeName || invoice.warehouseName) && (
          <div className="flex flex-wrap gap-x-6 gap-y-1 rounded-md border p-3 text-sm">
            {invoice.storeName && (
              <div>
                <span className="text-muted-foreground">{t('Store')}: </span>
                {invoice.storeName}
              </div>
            )}
            {invoice.warehouseName && (
              <div>
                <span className="text-muted-foreground">{t('Warehouse')}: </span>
                {invoice.warehouseName}
              </div>
            )}
          </div>
        )}

        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50 text-left text-xs uppercase text-muted-foreground">
                <th className="px-3 py-2 font-medium">{t('Product')}</th>
                <th className="px-3 py-2 text-right font-medium">{t('Quantity')}</th>
                <th className="px-3 py-2 text-right font-medium">{t('Purchase Price')}</th>
                <th className="px-3 py-2 text-right font-medium">{t('Line Total')}</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr>
                  <td colSpan={4} className="px-3 py-8 text-center text-muted-foreground">
                    {t('Loading…')}
                  </td>
                </tr>
              )}
              {!isLoading &&
                items.map((item) => (
                  <InvoiceItemRow
                    key={item.id}
                    item={item}
                    canPrice={canPrice}
                    price={prices[item.id] ?? ''}
                    onPriceChange={(id, value) => setPrices((prev) => ({ ...prev, [id]: value }))}
                  />
                ))}
              {!isLoading && items.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-3 py-8 text-center text-muted-foreground">
                    {t('No items found for this invoice.')}
                  </td>
                </tr>
              )}
            </tbody>
            {!isLoading && items.length > 0 && (
              <tfoot>
                <tr className="border-t bg-muted/30 font-medium">
                  <td className="px-3 py-2" colSpan={3}>
                    {t('Total')}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {formatCurrency(
                      items.reduce((s, it) => s + effectiveLineTotal(it, prices[it.id]), 0),
                    )}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>

        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            {t('Close')}
          </Button>
          {canPrice && (
            <Button
              type="button"
              aria-disabled={save.isPending}
              className={cn(save.isPending && 'pointer-events-none opacity-50')}
              onClick={() => {
                if (!save.isPending) save.mutate();
              }}
            >
              {save.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {invoice.status === 'PRICED' ? t('Update') : t('Save')}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function PendingEntitiesPage() {
  const { t } = useLanguage();
  const authUser = useAuthStore((s) => s.user);
  // Pricing a pending entity is what actually creates the vendor/supplier's
  // payable (see backend/pendingEntityRoutes.js) — a store admin may only
  // price their own store's entities, enforced server-side.
  const canPrice = grantsPermission(authUser?.permissions, 'pending-entities:price');

  const [status, setStatus] = useState<'PENDING' | 'PRICED'>('PENDING');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [viewing, setViewing] = useState<PendingInvoice | null>(null);

  useEffect(() => {
    setPage(1);
  }, [status, search]);

  const { data, isLoading } = useQuery({
    queryKey: ['pending-invoices', status, search, page],
    queryFn: async () =>
      (
        await api.get('/pending-entities/invoices', {
          params: { status, search: search || undefined, page, limit: PAGE_SIZE },
        })
      ).data as { invoices: PendingInvoice[]; total: number },
  });
  const invoices = data?.invoices ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex items-end gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs">{t('Status')}</Label>
            <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1">
              {(['PENDING', 'PRICED'] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => setStatus(s)}
                  className={cn(
                    'rounded-md px-3 py-1.5 text-sm font-medium transition',
                    status === s ? 'bg-background shadow-sm' : 'text-muted-foreground',
                  )}
                >
                  {s === 'PENDING' ? t('Pending') : t('Completed')}
                </button>
              ))}
            </div>
          </div>
          <div className="w-64 space-y-1.5">
            <Label className="text-xs">{t('Search')}</Label>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t('Search by vendor, product or #…')}
                className="pl-8"
              />
            </div>
          </div>
        </div>
        <p className="pb-2 text-sm text-muted-foreground">
          {total} {t('invoice(s)')}
        </p>
      </div>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-3 font-medium">{t('Source')}</th>
                <th className="px-4 py-3 font-medium">{t('Invoice #')}</th>
                <th className="px-4 py-3 font-medium">{t('Vendor')}</th>
                <th className="px-4 py-3 font-medium">{t('Date')}</th>
                <th className="px-4 py-3 text-right font-medium">{t('Items')}</th>
                <th className="px-4 py-3 text-right font-medium">{t('Amount')}</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">
                    {t('Loading…')}
                  </td>
                </tr>
              )}
              {!isLoading &&
                invoices.map((inv) => (
                  <tr
                    key={inv.id}
                    className="cursor-pointer border-b last:border-0 hover:bg-muted/30"
                    onClick={() => setViewing(inv)}
                  >
                    <td className="px-4 py-3 text-muted-foreground">
                      {sourceLabel(t, inv.sourceType)}
                    </td>
                    <td className="px-4 py-3 font-medium">{inv.sourceNo}</td>
                    <td className="px-4 py-3">{inv.vendorName}</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {new Date(inv.date).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                      {inv.pricedCount}/{inv.itemCount} {t('priced')}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums font-medium">
                      {inv.total !== undefined ? formatCurrency(inv.total) : '—'}
                    </td>
                  </tr>
                ))}
              {!isLoading && invoices.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">
                    {status === 'PENDING'
                      ? t('All caught up — no pending invoices')
                      : t('No completed invoices yet.')}
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

      {viewing && (
        <InvoiceItemsDialog
          invoice={viewing}
          canPrice={canPrice}
          onClose={() => setViewing(null)}
        />
      )}
    </div>
  );
}
