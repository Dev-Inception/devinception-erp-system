import { useEffect, useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Eye, Loader2, MoreHorizontal, PackageX, Printer, QrCode, Truck } from 'lucide-react';
import { toast } from 'sonner';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogClose,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu';
import { GatePassDialog } from '@/components/gate-pass-dialog';
import { api } from '@/lib/api';
import { formatCurrency } from '@/lib/utils';
import { openDamagedStockReturnInvoicePopup } from '@/lib/invoicePopup';
import { useAuthStore } from '@/store/auth';
import { grantsPermission } from '@/lib/modules';
import { useStorefrontFilter } from '@/store/storefront';
import { useLanguage } from '@/components/language-provider';

interface OutstandingItem {
  itemId: string;
  productId: string;
  name: string;
  damagedQuantity: number;
  returnedQuantity: number;
  outstandingQuantity: number;
  stockReceiptId: string;
  receiptNumber: string;
  date: string;
  supplierId: string;
  supplierName: string;
  storeId: string;
  warehouseId: string;
}

interface DamagedReturn {
  id: string;
  number: string;
  supplierId: string;
  supplierName: string;
  storeId?: string;
  storeName?: string;
  warehouseId: string;
  warehouseName: string;
  date: string;
  truck: { vehicleNumber: string; driverName: string; driverPhone: string };
  items: {
    productId: string;
    name: string;
    quantity: number;
    unitCost: number;
    lineTotal: number;
  }[];
  total: number;
  note: string;
  gatePassId?: string;
  gatePassQrUrl?: string;
}

/* ── Selected outstanding items → a new Damaged Stock Return, with an
   optional truck (for the pickup) and a note. Quantities default to the
   full outstanding amount but can be reduced (a partial return). ── */
function CreateReturnDialog({ items, onClose }: { items: OutstandingItem[]; onClose: () => void }) {
  const qc = useQueryClient();
  const { t } = useLanguage();
  const [quantities, setQuantities] = useState<Record<string, number>>(() =>
    Object.fromEntries(items.map((it) => [it.itemId, it.outstandingQuantity])),
  );
  const [vehicleNumber, setVehicleNumber] = useState('');
  const [driverName, setDriverName] = useState('');
  const [driverPhone, setDriverPhone] = useState('');
  const [note, setNote] = useState('');

  const first = items[0];
  const canSubmit = items.every(
    (it) => quantities[it.itemId] > 0 && quantities[it.itemId] <= it.outstandingQuantity,
  );

  const save = useMutation({
    mutationFn: async () =>
      (
        await api.post('/damaged-stock/returns', {
          supplierId: first.supplierId,
          storeId: first.storeId,
          warehouseId: first.warehouseId,
          truck:
            vehicleNumber || driverName || driverPhone
              ? {
                  vehicleNumber,
                  driverName: driverName || undefined,
                  driverPhone: driverPhone || undefined,
                }
              : undefined,
          items: items.map((it) => ({
            stockReceiptItemId: it.itemId,
            quantity: quantities[it.itemId],
          })),
          note: note || undefined,
        })
      ).data,
    onSuccess: () => {
      toast.success('Damaged stock return recorded');
      qc.invalidateQueries({ queryKey: ['damaged-stock'] });
      qc.invalidateQueries({ queryKey: ['damaged-stock-returns'] });
      onClose();
    },
    onError: (e: any) =>
      toast.error(
        e?.response?.data?.message?.[0] ??
          e?.response?.data?.message ??
          'Could not save this return',
      ),
  });

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <PackageX className="h-4 w-4" /> {t('Return Damaged Stock to Supplier')}
          </DialogTitle>
          <DialogDescription>
            {first.supplierName} — {items.length} {items.length === 1 ? t('item') : t('items')}.
            {t(' A gate pass is generated automatically for the truck taking this stock away.')}
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (canSubmit) save.mutate();
          }}
        >
          <div className="overflow-x-auto rounded-md border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50 text-left text-xs uppercase text-muted-foreground">
                  <th className="px-3 py-2 font-medium">{t('Product')}</th>
                  <th className="px-3 py-2 text-right font-medium">{t('Outstanding')}</th>
                  <th className="px-3 py-2 text-right font-medium">{t('Qty to Return')}</th>
                </tr>
              </thead>
              <tbody>
                {items.map((it) => (
                  <tr key={it.itemId} className="border-b last:border-0">
                    <td className="px-3 py-2">
                      {it.name}
                      <span className="block text-xs text-muted-foreground">
                        {it.receiptNumber}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                      {it.outstandingQuantity}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <Input
                        type="number"
                        min={0}
                        max={it.outstandingQuantity}
                        step="any"
                        className="h-8 w-24 ml-auto"
                        value={quantities[it.itemId] ?? ''}
                        onChange={(e) =>
                          setQuantities((q) => ({ ...q, [it.itemId]: Number(e.target.value) }))
                        }
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label>{t('Truck / Vehicle Number')}</Label>
              <Input
                value={vehicleNumber}
                onChange={(e) => setVehicleNumber(e.target.value)}
                placeholder="e.g. LEA-1234"
              />
            </div>
            <div className="space-y-1.5">
              <Label>{t('Driver Name')}</Label>
              <Input value={driverName} onChange={(e) => setDriverName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>{t('Driver Phone')}</Label>
              <Input value={driverPhone} onChange={(e) => setDriverPhone(e.target.value)} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>{t('Note (optional)')}</Label>
            <Input value={note} onChange={(e) => setNote(e.target.value)} />
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <DialogClose asChild>
              <Button type="button" variant="outline">
                {t('Cancel')}
              </Button>
            </DialogClose>
            <Button type="submit" disabled={!canSubmit || save.isPending}>
              {save.isPending && <Loader2 className="h-4 w-4 animate-spin" />} {t('Record Return')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ReturnDetailDialog({
  damagedReturn,
  onClose,
  onViewGatePass,
  onPrintInvoice,
}: {
  damagedReturn: DamagedReturn;
  onClose: () => void;
  onViewGatePass: (r: DamagedReturn) => void;
  onPrintInvoice: (r: DamagedReturn) => void;
}) {
  const { t } = useLanguage();
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <PackageX className="h-4 w-4" /> {damagedReturn.number}
          </DialogTitle>
          <DialogDescription>
            {new Date(damagedReturn.date).toLocaleDateString()} · {damagedReturn.supplierName}
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 rounded-md border p-3 text-sm">
          <div>
            <span className="text-muted-foreground">{t('Store')}: </span>
            {damagedReturn.storeName ?? '—'}
          </div>
          <div>
            <span className="text-muted-foreground">{t('Warehouse')}: </span>
            {damagedReturn.warehouseName}
          </div>
          <div>
            <span className="text-muted-foreground">{t('Vehicle #')}: </span>
            {damagedReturn.truck.vehicleNumber || '—'}
          </div>
          <div>
            <span className="text-muted-foreground">{t('Driver')}: </span>
            {damagedReturn.truck.driverName || '—'}
            {damagedReturn.truck.driverPhone ? ` (${damagedReturn.truck.driverPhone})` : ''}
          </div>
        </div>

        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50 text-left text-xs uppercase text-muted-foreground">
                <th className="px-3 py-2 font-medium">{t('Product')}</th>
                <th className="px-3 py-2 text-right font-medium">{t('Qty')}</th>
                <th className="px-3 py-2 text-right font-medium">{t('Unit Cost')}</th>
                <th className="px-3 py-2 text-right font-medium">{t('Line Total')}</th>
              </tr>
            </thead>
            <tbody>
              {damagedReturn.items.map((it) => (
                <tr key={it.productId} className="border-b last:border-0">
                  <td className="px-3 py-2">{it.name}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{it.quantity}</td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {formatCurrency(it.unitCost)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {formatCurrency(it.lineTotal)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t bg-muted/30 font-medium">
                <td className="px-3 py-2" colSpan={3}>
                  {t('Total')}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {formatCurrency(damagedReturn.total)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>

        {damagedReturn.note && (
          <p className="text-sm text-muted-foreground">
            <span className="font-medium text-foreground">{t('Note')}: </span>
            {damagedReturn.note}
          </p>
        )}

        <div className="flex flex-wrap justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => onPrintInvoice(damagedReturn)}>
            <Printer className="h-4 w-4" /> {t('Print Debit Note')}
          </Button>
          {damagedReturn.gatePassId && (
            <Button type="button" variant="outline" onClick={() => onViewGatePass(damagedReturn)}>
              <QrCode className="h-4 w-4" /> {t('View Gate Pass')}
            </Button>
          )}
          <Button type="button" variant="outline" onClick={onClose}>
            {t('Close')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function DamagedStockPage() {
  const { t } = useLanguage();
  const authUser = useAuthStore((s) => s.user);
  const canManage = grantsPermission(authUser?.permissions, 'damaged-stock:manage');
  const storefront = useStorefrontFilter();

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [creating, setCreating] = useState(false);
  const [viewingReturn, setViewingReturn] = useState<DamagedReturn | null>(null);
  const [viewingGatePass, setViewingGatePass] = useState<DamagedReturn | null>(null);

  const { data: outstandingData, isLoading: loadingOutstanding } = useQuery({
    queryKey: ['damaged-stock', storefront.store],
    queryFn: async () =>
      (await api.get('/damaged-stock', { params: { limit: 200, ...storefront } })).data as {
        items: OutstandingItem[];
        total: number;
      },
  });
  const outstanding = outstandingData?.items ?? [];

  const { data: returnsData, isLoading: loadingReturns } = useQuery({
    queryKey: ['damaged-stock-returns', storefront.store],
    queryFn: async () =>
      (await api.get('/damaged-stock/returns', { params: { limit: 50, ...storefront } })).data as {
        returns: DamagedReturn[];
        total: number;
      },
  });
  const returns = returnsData?.returns ?? [];

  // Selection is capped to one supplier + warehouse at a time — that's what
  // one return document (and its one gate pass) can cover.
  const activeGroup = useMemo(() => {
    const first = outstanding.find((it) => selected.has(it.itemId));
    return first ? { supplierId: first.supplierId, warehouseId: first.warehouseId } : null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, outstandingData]);

  useEffect(() => {
    // Drop any selected ids that vanished from the list (e.g. after a return).
    setSelected((s) => new Set([...s].filter((id) => outstanding.some((it) => it.itemId === id))));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [outstandingData]);

  const toggle = (it: OutstandingItem) => {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(it.itemId)) next.delete(it.itemId);
      else next.add(it.itemId);
      return next;
    });
  };

  const selectedItems = outstanding.filter((it) => selected.has(it.itemId));

  const handlePrintInvoice = async (r: DamagedReturn) => {
    try {
      await openDamagedStockReturnInvoicePopup({
        returnNumber: r.number,
        date: r.date,
        storeId: r.storeId,
        storeName: r.storeName,
        supplierName: r.supplierName,
        items: r.items.map((it) => ({
          name: it.name,
          quantity: it.quantity,
          unitCost: it.unitCost,
          lineTotal: it.lineTotal,
        })),
        total: r.total,
        truck: r.truck,
        note: r.note,
      });
    } catch {
      toast.error('Could not prepare the document');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <p className="text-sm text-muted-foreground">
          {outstanding.length}{' '}
          {outstanding.length === 1 ? t('damaged line item') : t('damaged line items')}{' '}
          {t('awaiting return to supplier')}
        </p>
        {canManage && (
          <Button disabled={selectedItems.length === 0} onClick={() => setCreating(true)}>
            <PackageX className="h-4 w-4" /> {t('Return Selected to Supplier')}
          </Button>
        )}
      </div>

      <Card className="overflow-hidden">
        <div className="border-b px-4 py-3 text-sm font-medium">
          {t('Outstanding Damaged Stock')}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                {canManage && <th className="w-8 px-4 py-3" />}
                <th className="px-4 py-3 font-medium">{t('Product')}</th>
                <th className="px-4 py-3 font-medium">{t('Receipt #')}</th>
                <th className="px-4 py-3 font-medium">{t('Supplier')}</th>
                <th className="px-4 py-3 text-right font-medium">{t('Damaged')}</th>
                <th className="px-4 py-3 text-right font-medium">{t('Returned')}</th>
                <th className="px-4 py-3 text-right font-medium">{t('Outstanding')}</th>
              </tr>
            </thead>
            <tbody>
              {loadingOutstanding && (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-muted-foreground">
                    {t('Loading…')}
                  </td>
                </tr>
              )}
              {!loadingOutstanding &&
                outstanding.map((it) => {
                  const disabled =
                    !!activeGroup &&
                    !selected.has(it.itemId) &&
                    (activeGroup.supplierId !== it.supplierId ||
                      activeGroup.warehouseId !== it.warehouseId);
                  return (
                    <tr key={it.itemId} className="border-b last:border-0 hover:bg-muted/30">
                      {canManage && (
                        <td className="px-4 py-3">
                          <input
                            type="checkbox"
                            checked={selected.has(it.itemId)}
                            disabled={disabled}
                            title={
                              disabled
                                ? t('Selections must share one supplier and warehouse')
                                : undefined
                            }
                            onChange={() => toggle(it)}
                          />
                        </td>
                      )}
                      <td className="px-4 py-3 font-medium">{it.name}</td>
                      <td className="px-4 py-3 text-muted-foreground">{it.receiptNumber}</td>
                      <td className="px-4 py-3 text-muted-foreground">{it.supplierName}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{it.damagedQuantity}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                        {it.returnedQuantity}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums font-medium text-destructive">
                        {it.outstandingQuantity}
                      </td>
                    </tr>
                  );
                })}
              {!loadingOutstanding && outstanding.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-muted-foreground">
                    {t('No damaged stock outstanding.')}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Card className="overflow-hidden">
        <div className="border-b px-4 py-3 text-sm font-medium">{t('Returns to Supplier')}</div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-3 font-medium">{t('Return #')}</th>
                <th className="px-4 py-3 font-medium">{t('Date')}</th>
                <th className="px-4 py-3 font-medium">{t('Supplier')}</th>
                <th className="px-4 py-3 font-medium">{t('Warehouse')}</th>
                <th className="px-4 py-3 text-right font-medium">{t('Items')}</th>
                <th className="px-4 py-3 text-right font-medium">{t('Value')}</th>
                <th className="px-4 py-3 text-right font-medium">{t('Actions')}</th>
              </tr>
            </thead>
            <tbody>
              {loadingReturns && (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-muted-foreground">
                    {t('Loading…')}
                  </td>
                </tr>
              )}
              {!loadingReturns &&
                returns.map((r) => (
                  <tr
                    key={r.id}
                    className="cursor-pointer border-b last:border-0 hover:bg-muted/30"
                    onClick={() => setViewingReturn(r)}
                  >
                    <td className="px-4 py-3 font-medium">{r.number}</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {new Date(r.date).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{r.supplierName}</td>
                    <td className="px-4 py-3 text-muted-foreground">{r.warehouseName}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                      {r.items.length}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums font-medium">
                      {formatCurrency(r.total)}
                    </td>
                    <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            title={t('Actions')}
                          >
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onSelect={() => setViewingReturn(r)}>
                            <Eye className="h-4 w-4" /> {t('View Details')}
                          </DropdownMenuItem>
                          <DropdownMenuItem onSelect={() => handlePrintInvoice(r)}>
                            <Printer className="h-4 w-4" /> {t('Print Debit Note')}
                          </DropdownMenuItem>
                          {r.gatePassId && (
                            <DropdownMenuItem onSelect={() => setViewingGatePass(r)}>
                              <QrCode className="h-4 w-4" /> {t('View Gate Pass')}
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </td>
                  </tr>
                ))}
              {!loadingReturns && returns.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-muted-foreground">
                    <Truck className="mx-auto mb-2 h-5 w-5 opacity-50" />
                    {t('No returns recorded yet.')}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {creating && selectedItems.length > 0 && (
        <CreateReturnDialog
          items={selectedItems}
          onClose={() => {
            setCreating(false);
            setSelected(new Set());
          }}
        />
      )}
      {viewingReturn && (
        <ReturnDetailDialog
          damagedReturn={viewingReturn}
          onClose={() => setViewingReturn(null)}
          onViewGatePass={setViewingGatePass}
          onPrintInvoice={handlePrintInvoice}
        />
      )}

      <GatePassDialog
        gatePassId={viewingGatePass?.gatePassId}
        gatePassQrUrl={viewingGatePass?.gatePassQrUrl}
        title={viewingGatePass?.number}
        open={viewingGatePass !== null}
        onOpenChange={(o) => !o && setViewingGatePass(null)}
      />
    </div>
  );
}
