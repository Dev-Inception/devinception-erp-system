import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { api } from '@/lib/api';
import { formatCurrency } from '@/lib/utils';

interface SaleItemDetail {
  productId: string;
  name: string;
  quantity: number;
  unitPrice: number;
  source?: 'WAREHOUSE' | 'VENDOR';
  vendorId?: string;
  vendorName?: string;
  warehouseId?: string;
}

interface SaleForEdit {
  id: string;
  saleNumber: string;
  items: SaleItemDetail[];
  discountTotal: number;
  taxPercent: number;
  transportFare?: number;
  labourRentTotal?: number;
  transport?: { driverName?: string; driverPhone?: string; vehicleNumber?: string };
}

interface WarehouseLite {
  id: string;
  name: string;
}

interface EditableLine extends SaleItemDetail {
  key: string;
}

/**
 * Full invoice edit — change item quantities/prices, remove lines, and
 * discount/tax/transport, recalculating totals. The backend reverses and
 * reapplies stock + the revenue/COGS journal entries; blocked once the sale
 * has any returns against it. Doesn't expose adding brand-new products or
 * re-picking labour — narrower, safer scope than a full re-checkout.
 */
export function UpdateSaleDialog({
  sale,
  open,
  onOpenChange,
}: {
  sale: SaleForEdit | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const qc = useQueryClient();
  const [lines, setLines] = useState<EditableLine[]>([]);
  const [discount, setDiscount] = useState(0);
  const [taxPercent, setTaxPercent] = useState(0);
  const [transportFare, setTransportFare] = useState(0);
  const [driverName, setDriverName] = useState('');
  const [driverPhone, setDriverPhone] = useState('');
  const [vehicleNumber, setVehicleNumber] = useState('');

  useEffect(() => {
    if (!sale) return;
    setLines(sale.items.map((it, idx) => ({ ...it, key: `${it.productId}-${idx}` })));
    setDiscount(sale.discountTotal);
    setTaxPercent(sale.taxPercent ?? 0);
    setTransportFare(sale.transportFare ?? 0);
    setDriverName(sale.transport?.driverName ?? '');
    setDriverPhone(sale.transport?.driverPhone ?? '');
    setVehicleNumber(sale.transport?.vehicleNumber ?? '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sale?.id]);

  const { data: warehouses = [] } = useQuery<WarehouseLite[]>({
    queryKey: ['warehouses'],
    queryFn: async () => (await api.get('/warehouses')).data,
    enabled: open,
  });

  const setLineQty = (key: string, quantity: number) =>
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, quantity } : l)));
  const setLinePrice = (key: string, unitPrice: number) =>
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, unitPrice } : l)));
  const setLineWarehouse = (key: string, warehouseId: string) =>
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, warehouseId } : l)));
  const removeLine = (key: string) => setLines((ls) => ls.filter((l) => l.key !== key));

  const subtotal = lines.reduce((s, l) => s + l.quantity * l.unitPrice, 0);
  const discountAmount = Math.min(subtotal, Math.max(0, discount));
  const net = subtotal - discountAmount;
  const taxAmount = (net * Math.max(0, taxPercent)) / 100;
  const labourRentTotal = sale?.labourRentTotal ?? 0;
  const total = Math.max(0, net + taxAmount + Math.max(0, transportFare) + labourRentTotal);

  const submit = useMutation({
    mutationFn: async () =>
      (
        await api.patch(`/sales/${sale!.id}`, {
          items: lines.map((l) => ({
            productId: l.productId,
            quantity: l.quantity,
            unitPrice: l.unitPrice,
            source: l.source || 'WAREHOUSE',
            vendor: l.source === 'VENDOR' ? l.vendorId : undefined,
            warehouseId: l.source === 'VENDOR' ? undefined : l.warehouseId,
          })),
          discountTotal: discountAmount,
          taxPercent: Math.max(0, taxPercent),
          transportFare: Math.max(0, transportFare),
          transport: { driverName, driverPhone, vehicleNumber },
        })
      ).data,
    onSuccess: () => {
      toast.success('Sale updated');
      qc.invalidateQueries({ queryKey: ['sales'] });
      onOpenChange(false);
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'Could not update sale'),
  });

  const canSubmit = lines.length > 0 && lines.every((l) => l.quantity > 0) && !submit.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Update Sale</DialogTitle>
          <DialogDescription>
            {sale ? `Editing ${sale.saleNumber}` : ''} — stock and accounting are reversed and
            reapplied for the revised items.
          </DialogDescription>
        </DialogHeader>

        {sale && (
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (canSubmit) submit.mutate();
            }}
          >
            <div className="space-y-2">
              {lines.map((l) => (
                <div key={l.key} className="space-y-1.5 rounded-md border p-2 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <span className="min-w-0 flex-1 truncate font-medium">{l.name}</span>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 shrink-0 text-destructive"
                      onClick={() => removeLine(l.key)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    {l.source === 'VENDOR' ? (
                      <div className="col-span-1 flex items-center text-xs text-muted-foreground">
                        Vendor: {l.vendorName || '—'}
                      </div>
                    ) : (
                      <select
                        className="col-span-1 h-8 rounded-md border bg-transparent px-2 text-xs"
                        value={l.warehouseId ?? ''}
                        onChange={(e) => setLineWarehouse(l.key, e.target.value)}
                      >
                        {warehouses.map((w) => (
                          <option key={w.id} value={w.id}>
                            {w.name}
                          </option>
                        ))}
                      </select>
                    )}
                    <Input
                      type="number"
                      min={0}
                      step="any"
                      placeholder="Qty"
                      className="h-8 text-right"
                      value={l.quantity || ''}
                      onChange={(e) => setLineQty(l.key, Number(e.target.value))}
                    />
                    <Input
                      type="number"
                      min={0}
                      step="0.01"
                      placeholder="Price"
                      className="h-8 text-right"
                      value={l.unitPrice || ''}
                      onChange={(e) => setLinePrice(l.key, Number(e.target.value))}
                    />
                  </div>
                </div>
              ))}
              {lines.length === 0 && (
                <p className="py-4 text-center text-sm text-muted-foreground">
                  Every line was removed — a sale needs at least one item.
                </p>
              )}
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Discount (Rs)</Label>
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  value={discount || ''}
                  onChange={(e) => setDiscount(Number(e.target.value))}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Tax %</Label>
                <Input
                  type="number"
                  min={0}
                  max={100}
                  step="0.01"
                  value={taxPercent || ''}
                  onChange={(e) => setTaxPercent(Number(e.target.value))}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Transport fare</Label>
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  value={transportFare || ''}
                  onChange={(e) => setTransportFare(Number(e.target.value))}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Vehicle number</Label>
                <Input value={vehicleNumber} onChange={(e) => setVehicleNumber(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Driver name</Label>
                <Input value={driverName} onChange={(e) => setDriverName(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Driver phone</Label>
                <Input value={driverPhone} onChange={(e) => setDriverPhone(e.target.value)} />
              </div>
            </div>

            <div className="space-y-1 rounded-lg border p-3 text-sm">
              <div className="flex justify-between text-muted-foreground">
                <span>Subtotal</span>
                <span>{formatCurrency(subtotal)}</span>
              </div>
              {discountAmount > 0 && (
                <div className="flex justify-between text-muted-foreground">
                  <span>Discount</span>
                  <span>−{formatCurrency(discountAmount)}</span>
                </div>
              )}
              {taxAmount > 0 && (
                <div className="flex justify-between text-muted-foreground">
                  <span>Tax</span>
                  <span>{formatCurrency(taxAmount)}</span>
                </div>
              )}
              {transportFare > 0 && (
                <div className="flex justify-between text-muted-foreground">
                  <span>Transport Fare</span>
                  <span>{formatCurrency(transportFare)}</span>
                </div>
              )}
              {labourRentTotal > 0 && (
                <div className="flex justify-between text-muted-foreground">
                  <span>Labour Rent</span>
                  <span>{formatCurrency(labourRentTotal)}</span>
                </div>
              )}
              <div className="flex justify-between text-base font-bold">
                <span>New Total</span>
                <span>{formatCurrency(total)}</span>
              </div>
            </div>

            <Button type="submit" className="w-full" disabled={!canSubmit}>
              {submit.isPending ? 'Saving…' : 'Save Changes'}
            </Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
