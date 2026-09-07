import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Clock3, Eye, Search, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { GatePassDialog } from '@/components/gate-pass-dialog';
import { api } from '@/lib/api';
import { useAuthStore } from '@/store/auth';
import { useStorefrontFilter } from '@/store/storefront';
import { useLanguage } from '@/components/language-provider';

interface GatePassItem {
  productId: string;
  name: string;
  sku?: string;
  quantity: number;
  returnedQuantity?: number;
}

interface GatePass {
  id: string;
  number: string;
  sourceType: 'SALE' | 'PURCHASE' | 'RETURN';
  saleNumber: string;
  saleDate: string;
  status: 'PENDING' | 'PROCESSED' | 'CANCELLED';
  items: GatePassItem[];
  processedAt?: string;
  processedBy?: { name?: string };
  scannedBy?: { name?: string };
}

export function GatePassesPage() {
  const [status, setStatus] = useState<'ALL' | 'PENDING' | 'PROCESSED'>('ALL');
  const [search, setSearch] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const storefront = useStorefrontFilter();
  const { t } = useLanguage();
  const qc = useQueryClient();
  const isSuperAdmin = useAuthStore((s) => s.user?.role) === 'SUPER_ADMIN';
  const [viewing, setViewing] = useState<GatePass | null>(null);

  const { data, isLoading } = useQuery<{
    gatePasses: GatePass[];
    total: number;
  }>({
    queryKey: ['gate-passes', status, from, to, storefront.store],
    queryFn: async () =>
      (
        await api.get('/gate-passes', {
          params: {
            limit: 100,
            ...(status === 'ALL' ? {} : { status }),
            from: from || undefined,
            to: to || undefined,
            ...storefront,
          },
        })
      ).data,
  });
  const gatePasses = data?.gatePasses ?? [];

  const q = search.trim().toLowerCase();
  const filteredGatePasses = q
    ? gatePasses.filter((g) => g.number.toLowerCase().includes(q))
    : gatePasses;

  const deleteGatePass = useMutation({
    mutationFn: async (id: string) => api.delete(`/gate-passes/${id}`),
    onSuccess: () => {
      toast.success('Gate pass deleted');
      qc.invalidateQueries({ queryKey: ['gate-passes'] });
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'Could not delete gate pass'),
  });

  const remove = (gatePass: GatePass) => {
    if (window.confirm(`Delete gate pass "${gatePass.number}"? This cannot be undone.`)) {
      deleteGatePass.mutate(gatePass.id);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Gate Passes</h1>
          <p className="text-sm text-muted-foreground">
            Review pending and processed vehicle loads.
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <div className="w-64 space-y-1.5">
            <Label className="text-xs">{t('Search')}</Label>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t('Search by gate pass #…')}
                className="pl-8"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">{t('From')}</Label>
            <Input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="w-36"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">{t('To')}</Label>
            <Input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="w-36"
            />
          </div>
          {(['ALL', 'PENDING', 'PROCESSED'] as const).map((value) => (
            <Button
              key={value}
              size="sm"
              variant={status === value ? 'default' : 'outline'}
              onClick={() => setStatus(value)}
            >
              {value === 'ALL' ? 'All' : value === 'PENDING' ? 'Pending' : 'Processed'}
            </Button>
          ))}
        </div>
      </div>

      <Card className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-sm">
          <thead>
            <tr className="border-b bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th className="px-4 py-3 font-medium">{t('Gate Pass')}</th>
              <th className="px-4 py-3 font-medium">{t('Document')}</th>
              <th className="px-4 py-3 font-medium">{t('Products / Qty')}</th>
              <th className="px-4 py-3 font-medium">{t('Scanned By')}</th>
              <th className="px-4 py-3 font-medium">{t('Status')}</th>
              <th className="px-4 py-3 text-right font-medium">{t('Actions')}</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">
                  Loading…
                </td>
              </tr>
            )}
            {!isLoading && filteredGatePasses.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">
                  {q ? `No gate passes match "${search}".` : 'No gate passes found.'}
                </td>
              </tr>
            )}
            {filteredGatePasses.map((gatePass) => (
              <tr key={gatePass.id} className="border-b last:border-0">
                <td className="px-4 py-3 font-medium">{gatePass.number}</td>
                <td className="px-4 py-3">
                  <div>{gatePass.saleNumber}</div>
                  <div className="text-xs text-muted-foreground">
                    {gatePass.sourceType === 'SALE' ? 'Goods Out' : 'Goods In'}
                  </div>
                </td>
                <td className="px-4 py-3">
                  {gatePass.items.map((item) => (
                    <div key={item.productId}>
                      {item.name} × {item.quantity}
                      {item.returnedQuantity ? (
                        <span className="ml-1 text-xs text-destructive">
                          ({item.returnedQuantity} returned)
                        </span>
                      ) : null}
                    </div>
                  ))}
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  {gatePass.scannedBy?.name ?? gatePass.processedBy?.name ?? '—'}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    {gatePass.status === 'PROCESSED' ? (
                      <CheckCircle2 className="h-4 w-4 text-success" />
                    ) : (
                      <Clock3 className="h-4 w-4 text-blue-500" />
                    )}
                    <span>{gatePass.status === 'PROCESSED' ? 'Processed' : 'Pending'}</span>
                  </div>
                  {gatePass.processedAt && (
                    <div className="mt-1 text-xs text-muted-foreground">
                      {new Date(gatePass.processedAt).toLocaleString()}
                    </div>
                  )}
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex justify-end gap-1">
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8"
                      title={t('View')}
                      onClick={() => setViewing(gatePass)}
                    >
                      <Eye className="h-4 w-4" />
                    </Button>
                    {isSuperAdmin && (
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8"
                        title={t('Delete')}
                        disabled={deleteGatePass.isPending}
                        onClick={() => remove(gatePass)}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <GatePassDialog
        gatePassId={viewing?.id}
        gatePassQrUrl={viewing ? `/gate-passes/${viewing.id}/qr` : undefined}
        title={viewing?.number}
        open={viewing !== null}
        onOpenChange={(o) => !o && setViewing(null)}
      />
    </div>
  );
}
