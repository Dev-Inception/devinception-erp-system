import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, Clock3, Search } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { api } from '@/lib/api';
import { useStorefrontFilter } from '@/store/storefront';

interface GatePassItem {
  productId: string;
  name: string;
  sku?: string;
  quantity: number;
}

interface GatePass {
  id: string;
  number: string;
  sourceType: 'SALE' | 'PURCHASE';
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
  const storefront = useStorefrontFilter();
  const { data, isLoading } = useQuery<{
    gatePasses: GatePass[];
    total: number;
  }>({
    queryKey: ['gate-passes', status, storefront.store],
    queryFn: async () =>
      (
        await api.get('/gate-passes', {
          params: { limit: 100, ...(status === 'ALL' ? {} : { status }), ...storefront },
        })
      ).data,
  });
  const gatePasses = data?.gatePasses ?? [];

  const q = search.trim().toLowerCase();
  const filteredGatePasses = q
    ? gatePasses.filter((g) => g.number.toLowerCase().includes(q))
    : gatePasses;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Gate Passes</h1>
          <p className="text-sm text-muted-foreground">
            Review pending and processed vehicle loads.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative w-64">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by gate pass #…"
              className="pl-8"
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
              <th className="px-4 py-3 font-medium">Gate Pass</th>
              <th className="px-4 py-3 font-medium">Document</th>
              <th className="px-4 py-3 font-medium">Products / Qty</th>
              <th className="px-4 py-3 font-medium">Scanned By</th>
              <th className="px-4 py-3 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-muted-foreground">
                  Loading…
                </td>
              </tr>
            )}
            {!isLoading && filteredGatePasses.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-muted-foreground">
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
                    {gatePass.sourceType === 'PURCHASE' ? 'Goods In' : 'Goods Out'}
                  </div>
                </td>
                <td className="px-4 py-3">
                  {gatePass.items.map((item) => (
                    <div key={item.productId}>
                      {item.name} × {item.quantity}
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
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
