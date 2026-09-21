import { useQuery } from '@tanstack/react-query';
import { Printer } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';
import { buildGatePassScanQr } from '@/lib/gatePass';
import { renderGatePassTemplate } from '@/lib/printing';
import { usePrintPreviewStore } from '@/store/printPreview';

interface GatePassDetail {
  id: string;
  number: string;
  storeId?: string;
  sourceType?: 'SALE' | 'PURCHASE' | 'RETURN' | 'SUPPLIER_RETURN' | 'VENDOR_SALE';
  direction?: 'IN' | 'OUT';
  partyName?: string;
  saleNumber: string;
  saleDate: string;
  items: {
    name: string;
    quantity: number;
    returnedQuantity?: number;
  }[];
  status: 'PENDING' | 'PROCESSED' | 'CANCELLED';
  processedAt?: string;
  processedBy?: { name?: string };
  scannedBy?: { name?: string };
  createdBy?: { name?: string };
}

const STATUS_STYLE: Record<string, string> = {
  PENDING: 'text-blue-500',
  PROCESSED: 'text-success',
  CANCELLED: 'text-destructive',
};

/**
 * Controlled dialog (no internal DialogTrigger) so it can be opened from a
 * DropdownMenuItem without nesting a Radix Dialog inside a Radix DropdownMenu.
 */
export function GatePassDialog({
  gatePassId,
  gatePassQrUrl,
  title = 'Gate Pass',
  open,
  onOpenChange,
}: {
  gatePassId?: string;
  gatePassQrUrl?: string;
  title?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { data, isLoading, isError } = useQuery<GatePassDetail>({
    queryKey: ['gate-pass', gatePassId],
    queryFn: async () => (await api.get(`/gate-passes/${gatePassId}`)).data,
    enabled: open && Boolean(gatePassId),
  });

  const { data: qr } = useQuery({
    queryKey: ['gate-pass-scan-qr', gatePassId],
    queryFn: () => buildGatePassScanQr(gatePassQrUrl as string),
    enabled: open && Boolean(gatePassId) && Boolean(gatePassQrUrl),
  });

  const { data: settings } = useQuery({
    queryKey: ['settings-for-gate-pass-print', data?.storeId],
    queryFn: async () =>
      (await api.get('/settings', data?.storeId ? { params: { store: data.storeId } } : undefined))
        .data,
    enabled: open && Boolean(data),
  });

  const printGatePass = () => {
    if (!data) return;
    const html = renderGatePassTemplate({
      company: {
        name: settings?.companyName || 'DevInception Retail',
        address: settings?.address,
        phone: settings?.phone,
        email: settings?.email,
        taxNumber: settings?.taxNumber,
        logoUrl: settings?.logoUrl,
      },
      number: data.number,
      date: new Date(data.saleDate || Date.now()).toLocaleDateString(),
      direction:
        data.direction ?? (isSupplierReturn ? 'OUT' : isPurchase || isReturn ? 'IN' : 'OUT'),
      partyName:
        data.partyName ||
        (isPurchase || isSupplierReturn
          ? 'Supplier'
          : isVendorSale
            ? 'Vendor'
            : 'Walk-in Customer'),
      documentLabel: docLabel,
      documentNumber: data.saleNumber,
      purpose: `${directionLabel.charAt(0).toUpperCase()}${directionLabel.slice(1)}`,
      items: data.items.map((it) => ({
        name: it.name,
        quantity: it.quantity,
      })),
      preparedBy: data.createdBy?.name,
      authorizedBy: data.processedBy?.name ?? data.scannedBy?.name,
      authorizedAt: data.processedAt ? new Date(data.processedAt).toLocaleString() : undefined,
      qrDataUrl: qr?.qrDataUrl,
    });
    usePrintPreviewStore.getState().open(html);
  };

  const isPurchase = data?.sourceType === 'PURCHASE';
  const isReturn = data?.sourceType === 'RETURN';
  const isSupplierReturn = data?.sourceType === 'SUPPLIER_RETURN';
  const isVendorSale = data?.sourceType === 'VENDOR_SALE';
  const docLabel = isPurchase
    ? 'Purchase #'
    : isReturn || isSupplierReturn
      ? 'Return #'
      : isVendorSale
        ? 'Vendor Sale #'
        : 'Sale #';
  const directionLabel = isSupplierReturn
    ? 'damaged goods going back out to the supplier'
    : isReturn
      ? 'goods coming back in'
      : isPurchase
        ? 'goods coming in'
        : isVendorSale
          ? 'goods going out to the vendor'
          : 'goods going out';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            Tracks {directionLabel}. A signed-in gate user verifies quantities, records the driver
            and vehicle, signs, and processes the pass.
          </DialogDescription>
        </DialogHeader>

        {!gatePassId && <p className="text-sm text-muted-foreground">Gate pass not available.</p>}
        {gatePassId && isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
        {gatePassId && isError && (
          <p className="text-sm text-destructive">Could not load gate pass.</p>
        )}

        {data && (
          <div className="space-y-4">
            <div className="space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Gate Pass #</span>
                <span className="font-medium">{data.number}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">{docLabel}</span>
                <span className="font-medium">{data.saleNumber}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Status</span>
                <span className={`font-medium ${STATUS_STYLE[data.status] ?? ''}`}>
                  {data.status}
                  {data.status === 'PROCESSED' && data.processedAt
                    ? ` · ${new Date(data.processedAt).toLocaleString()}`
                    : ''}
                </span>
              </div>
              {(data.scannedBy?.name || data.processedBy?.name) && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Scanned by</span>
                  <span className="font-medium">
                    {data.scannedBy?.name ?? data.processedBy?.name}
                  </span>
                </div>
              )}
            </div>

            <div className="max-h-40 space-y-1 overflow-y-auto rounded-lg border p-2 text-sm">
              {data.items.map((it, idx) => (
                <div key={idx} className="flex justify-between">
                  <span>
                    {it.name}
                    {it.returnedQuantity ? (
                      <span className="ml-1.5 text-xs text-destructive">
                        ({it.returnedQuantity} returned)
                      </span>
                    ) : null}
                  </span>
                  <span className="tabular-nums">Qty {it.quantity}</span>
                </div>
              ))}
            </div>

            {qr && (
              <div className="flex flex-col items-center gap-2">
                <img src={qr.qrDataUrl} alt="Gate pass QR" className="h-40 w-40" />
                <div className="flex flex-wrap justify-center gap-2">
                  <Button size="lg" variant="default" onClick={printGatePass}>
                    <Printer className="h-4 w-4" /> Print
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
