import { useQuery } from '@tanstack/react-query';
import { QrCode } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';
import { formatCurrency } from '@/lib/utils';
import { useWarehouses } from '@/components/layout/warehouse-switcher';

interface SaleReturnItem {
  productId: string;
  name: string;
  quantity: number;
}

interface SaleReturnRow {
  id: string;
  number: string;
  date: string;
  items: SaleReturnItem[];
  total: number;
  note?: string;
  warehouseGatePasses?: { warehouseId: string; gatePassId: string; gatePassQrUrl?: string }[];
}

/**
 * Returns already recorded against one sale — reached from that sale's own
 * row instead of a separate "Sale Returns" tab, so returns stay attached to
 * the sale they belong to. Each return that restocked a warehouse also
 * offers its own "goods coming back in" gate pass.
 */
export function SaleReturnsDialog({
  sale,
  open,
  onOpenChange,
  onViewGatePass,
}: {
  sale: { id: string; saleNumber: string } | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onViewGatePass: (gatePass: { id: string; qrUrl?: string; title: string }) => void;
}) {
  const { warehouses } = useWarehouses();
  const { data: returns = [], isLoading } = useQuery<SaleReturnRow[]>({
    queryKey: ['sale-returns', sale?.id],
    queryFn: async () => (await api.get(`/sales/${sale!.id}/returns`)).data,
    enabled: open && Boolean(sale?.id),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Returns</DialogTitle>
          <DialogDescription>{sale ? `Against sale ${sale.saleNumber}` : ''}</DialogDescription>
        </DialogHeader>
        <div className="max-h-[60vh] space-y-3 overflow-y-auto">
          {isLoading && <p className="py-6 text-center text-sm text-muted-foreground">Loading…</p>}
          {!isLoading && returns.length === 0 && (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No returns recorded for this sale.
            </p>
          )}
          {returns.map((r) => {
            const passes = r.warehouseGatePasses ?? [];
            return (
              <div key={r.id} className="space-y-2 rounded-lg border p-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="font-medium">{r.number}</span>
                  <span className="text-muted-foreground">{new Date(r.date).toLocaleString()}</span>
                </div>
                <div className="space-y-0.5 text-muted-foreground">
                  {r.items.map((it) => (
                    <div key={it.productId} className="flex justify-between">
                      <span>{it.name}</span>
                      <span className="tabular-nums">×{it.quantity}</span>
                    </div>
                  ))}
                </div>
                <div className="flex items-center justify-between border-t pt-2">
                  <span className="font-medium">{formatCurrency(r.total)}</span>
                  {r.note && <span className="text-xs text-muted-foreground">{r.note}</span>}
                </div>
                {passes.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {passes.map((g) => {
                      const wh = warehouses.find((w) => w.id === g.warehouseId);
                      const multiple = passes.length > 1;
                      const label = multiple
                        ? `Return Gate Pass — ${wh?.name ?? 'Warehouse'}`
                        : 'Return Gate Pass';
                      return (
                        <Button
                          key={g.gatePassId}
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            onViewGatePass({
                              id: g.gatePassId,
                              qrUrl: g.gatePassQrUrl,
                              title: label,
                            })
                          }
                        >
                          <QrCode className="h-3.5 w-3.5" /> {label}
                        </Button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
