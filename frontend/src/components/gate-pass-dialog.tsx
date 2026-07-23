import { useQuery } from '@tanstack/react-query';
import { Copy, Download, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
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

interface GatePassDetail {
  id: string;
  number: string;
  sourceType?: 'SALE' | 'PURCHASE';
  direction?: 'IN' | 'OUT';
  saleNumber: string;
  saleDate: string;
  items: { name: string; quantity: number; loadedQuantity?: number }[];
  status: 'PENDING' | 'PROCESSED' | 'CANCELLED';
  processedAt?: string;
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
  open,
  onOpenChange,
}: {
  gatePassId?: string;
  gatePassQrUrl?: string;
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

  const copyLink = async () => {
    if (!qr) return;
    await navigator.clipboard.writeText(qr.publicUrl);
    toast.success('Public gate pass link copied');
  };

  const downloadQr = () => {
    if (!qr || !data) return;
    const a = document.createElement('a');
    a.href = qr.qrDataUrl;
    a.download = `gate-pass-${data.number}.png`;
    a.click();
  };

  const isPurchase = data?.sourceType === 'PURCHASE';
  const docLabel = isPurchase ? 'Purchase #' : 'Sale #';
  const directionLabel = isPurchase ? 'goods coming in' : 'goods going out';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Gate Pass</DialogTitle>
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
            </div>

            <div className="max-h-40 space-y-1 overflow-y-auto rounded-lg border p-2 text-sm">
              {data.items.map((it, idx) => (
                <div key={idx} className="flex justify-between">
                  <span>{it.name}</span>
                  <span className="tabular-nums">Qty {it.quantity}</span>
                </div>
              ))}
            </div>

            {qr && (
              <div className="flex flex-col items-center gap-2">
                <img src={qr.qrDataUrl} alt="Gate pass QR" className="h-40 w-40" />
                <p className="max-w-full break-all text-center text-xs text-muted-foreground">
                  {qr.publicUrl}
                </p>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={downloadQr}>
                    <Download className="h-4 w-4" /> Download
                  </Button>
                  <Button size="sm" variant="outline" onClick={copyLink}>
                    <Copy className="h-4 w-4" /> Copy Link
                  </Button>
                  <Button size="sm" variant="outline" asChild>
                    <a href={qr.publicUrl} target="_blank" rel="noreferrer">
                      <ExternalLink className="h-4 w-4" /> Open
                    </a>
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
