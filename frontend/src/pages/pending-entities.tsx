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
  DialogClose,
} from '@/components/ui/dialog';
import { cn, formatCurrency } from '@/lib/utils';
import { api } from '@/lib/api';
import { useAuthStore } from '@/store/auth';
import { grantsPermission } from '@/lib/modules';
import { useLanguage } from '@/components/language-provider';

interface PendingEntity {
  id: string;
  sourceType: 'SALE_ITEM' | 'STOCK_RECEIPT_ITEM';
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

function sourceLabel(t: (s: string) => string, sourceType: PendingEntity['sourceType']) {
  return sourceType === 'SALE_ITEM' ? t('Sale (vendor item)') : t('Stock receipt');
}

/** Everything about one pending entity — source, invoice #, date, vendor,
 * product, quantity, and (for those who can price it) the purchase-price
 * form that posts the vendor's real payable, all in one place instead of a
 * separate view/edit pair. Gated by the pending-entities:price permission
 * (see PendingEntitiesPage). */
function EntityDetailDialog({
  entity,
  canPrice,
  onClose,
}: {
  entity: PendingEntity;
  canPrice: boolean;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const { t } = useLanguage();
  const editing = entity.status === 'PRICED';
  const [purchasePrice, setPurchasePrice] = useState(
    editing && entity.purchasePrice !== undefined ? String(entity.purchasePrice) : '',
  );

  const save = useMutation({
    mutationFn: async () =>
      (
        await api.patch(`/pending-entities/${entity.id}/price`, {
          purchasePrice: Number(purchasePrice),
        })
      ).data,
    onSuccess: () => {
      toast.success(editing ? 'Purchase price updated' : 'Purchase price recorded');
      qc.invalidateQueries({ queryKey: ['pending-entities'] });
      qc.invalidateQueries({ queryKey: ['vendors'] });
      onClose();
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'Could not set the price'),
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{entity.sourceNo}</DialogTitle>
          <DialogDescription>
            {sourceLabel(t, entity.sourceType)} · {new Date(entity.date).toLocaleDateString()}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-1.5 rounded-md border p-3 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">{t('Vendor')}</span>
            <span className="font-medium">{entity.vendorName}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">{t('Product')}</span>
            <span className="font-medium">{entity.productName}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">{t('Quantity')}</span>
            <span className="font-medium">{entity.quantity}</span>
          </div>
          {entity.storeName && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t('Store')}</span>
              <span>{entity.storeName}</span>
            </div>
          )}
          {entity.warehouseName && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t('Warehouse')}</span>
              <span>{entity.warehouseName}</span>
            </div>
          )}
          <div className="flex justify-between">
            <span className="text-muted-foreground">{t('Status')}</span>
            <span>{entity.status === 'PRICED' ? t('Priced') : t('Pending')}</span>
          </div>
          {entity.lineTotal !== undefined && (
            <div className="flex justify-between border-t pt-1.5 text-base font-bold">
              <span>{t('Amount')}</span>
              <span>{formatCurrency(entity.lineTotal)}</span>
            </div>
          )}
        </div>

        {canPrice ? (
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              save.mutate();
            }}
          >
            <div className="space-y-1.5">
              <Label>{t('Purchase Price (per unit)')} *</Label>
              <Input
                type="number"
                required
                min={0.01}
                step="0.01"
                autoFocus
                value={purchasePrice}
                onChange={(e) => setPurchasePrice(e.target.value)}
                placeholder="0.00"
              />
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <DialogClose asChild>
                <Button type="button" variant="outline">
                  {t('Close')}
                </Button>
              </DialogClose>
              <Button type="submit" disabled={save.isPending}>
                {save.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                {editing ? t('Update') : t('Set Price')}
              </Button>
            </div>
          </form>
        ) : (
          <div className="flex justify-end">
            <Button type="button" variant="outline" onClick={onClose}>
              {t('Close')}
            </Button>
          </div>
        )}
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
  const [viewing, setViewing] = useState<PendingEntity | null>(null);

  useEffect(() => {
    setPage(1);
  }, [status, search]);

  const { data, isLoading } = useQuery({
    queryKey: ['pending-entities', status, search, page],
    queryFn: async () =>
      (
        await api.get('/pending-entities', {
          params: { status, search: search || undefined, page, limit: PAGE_SIZE },
        })
      ).data as { entities: PendingEntity[]; total: number },
  });
  const entities = data?.entities ?? [];
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
          {total} {t('item(s)')}
        </p>
      </div>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-3 font-medium">{t('Source')}</th>
                <th className="px-4 py-3 font-medium">{t('Invoice #')}</th>
                <th className="px-4 py-3 font-medium">{t('Date')}</th>
                <th className="px-4 py-3 text-right font-medium">{t('Amount')}</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr>
                  <td colSpan={4} className="px-4 py-10 text-center text-muted-foreground">
                    {t('Loading…')}
                  </td>
                </tr>
              )}
              {!isLoading &&
                entities.map((e) => (
                  <tr
                    key={e.id}
                    className="cursor-pointer border-b last:border-0 hover:bg-muted/30"
                    onClick={() => setViewing(e)}
                  >
                    <td className="px-4 py-3 text-muted-foreground">
                      {sourceLabel(t, e.sourceType)}
                    </td>
                    <td className="px-4 py-3 font-medium">{e.sourceNo}</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {new Date(e.date).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums font-medium">
                      {e.lineTotal !== undefined ? formatCurrency(e.lineTotal) : '—'}
                    </td>
                  </tr>
                ))}
              {!isLoading && entities.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-10 text-center text-muted-foreground">
                    {status === 'PENDING'
                      ? t('All caught up — no pending items')
                      : t('No completed entities yet.')}
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
        <EntityDetailDialog entity={viewing} canPrice={canPrice} onClose={() => setViewing(null)} />
      )}
    </div>
  );
}
