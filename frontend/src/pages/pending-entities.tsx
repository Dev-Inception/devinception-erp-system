import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2, Search, Tag } from 'lucide-react';
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

/** Super-admin-only: put a price on a pending entity, which posts the
 * vendor's real payable. */
function SetPriceDialog({ entity, onClose }: { entity: PendingEntity; onClose: () => void }) {
  const qc = useQueryClient();
  const { t } = useLanguage();
  const [purchasePrice, setPurchasePrice] = useState('');

  const save = useMutation({
    mutationFn: async () =>
      (
        await api.patch(`/pending-entities/${entity.id}/price`, {
          purchasePrice: Number(purchasePrice),
        })
      ).data,
    onSuccess: () => {
      toast.success('Purchase price recorded');
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
          <DialogTitle>{t('Set Purchase Price')}</DialogTitle>
          <DialogDescription>
            {entity.productName} · {entity.quantity} {t('units from')} {entity.vendorName}
          </DialogDescription>
        </DialogHeader>
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
                {t('Cancel')}
              </Button>
            </DialogClose>
            <Button type="submit" disabled={save.isPending}>
              {save.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              {t('Save')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function PendingEntitiesPage() {
  const { t } = useLanguage();
  const role = useAuthStore((s) => s.user?.role);
  // Only a super admin may price a pending entity — that's what actually
  // creates the vendor's payable (see backend/pendingEntityRoutes.js).
  const canPrice = role === 'SUPER_ADMIN';

  const [status, setStatus] = useState<'PENDING' | 'PRICED'>('PENDING');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pricing, setPricing] = useState<PendingEntity | null>(null);

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
                  {s === 'PENDING' ? t('Pending') : t('Priced')}
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
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th className="px-4 py-3 font-medium">{t('Source')}</th>
              <th className="px-4 py-3 font-medium">{t('#')}</th>
              <th className="px-4 py-3 font-medium">{t('Date')}</th>
              <th className="px-4 py-3 font-medium">{t('Vendor')}</th>
              <th className="px-4 py-3 font-medium">{t('Product')}</th>
              <th className="px-4 py-3 text-right font-medium">{t('Qty')}</th>
              <th className="px-4 py-3 text-right font-medium">{t('Purchase Price')}</th>
              <th className="px-4 py-3 text-right font-medium">{t('Total')}</th>
              {canPrice && status === 'PENDING' && (
                <th className="px-4 py-3 text-right font-medium">{t('Actions')}</th>
              )}
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={9} className="px-4 py-10 text-center text-muted-foreground">
                  {t('Loading…')}
                </td>
              </tr>
            )}
            {!isLoading &&
              entities.map((e) => (
                <tr key={e.id} className="border-b last:border-0 hover:bg-muted/30">
                  <td className="px-4 py-3 text-muted-foreground">
                    {sourceLabel(t, e.sourceType)}
                  </td>
                  <td className="px-4 py-3 font-medium">{e.sourceNo}</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {new Date(e.date).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3">{e.vendorName}</td>
                  <td className="px-4 py-3">{e.productName}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{e.quantity}</td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {e.purchasePrice !== undefined ? formatCurrency(e.purchasePrice) : '—'}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums font-medium">
                    {e.lineTotal !== undefined ? formatCurrency(e.lineTotal) : '—'}
                  </td>
                  {canPrice && status === 'PENDING' && (
                    <td className="px-4 py-3 text-right">
                      <Button size="sm" variant="outline" onClick={() => setPricing(e)}>
                        <Tag className="h-4 w-4" /> {t('Set Price')}
                      </Button>
                    </td>
                  )}
                </tr>
              ))}
            {!isLoading && entities.length === 0 && (
              <tr>
                <td colSpan={9} className="px-4 py-10 text-center text-muted-foreground">
                  {status === 'PENDING'
                    ? t('Nothing waiting to be priced.')
                    : t('No priced entities yet.')}
                </td>
              </tr>
            )}
          </tbody>
        </table>
        <Pagination
          page={page}
          totalPages={totalPages}
          total={total}
          pageSize={PAGE_SIZE}
          onPageChange={setPage}
          className="border-t"
        />
      </Card>

      {pricing && <SetPriceDialog entity={pricing} onClose={() => setPricing(null)} />}
    </div>
  );
}
