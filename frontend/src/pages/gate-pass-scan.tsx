import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Loader2, PackageCheck, XCircle } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';
import { formatCurrency } from '@/lib/utils';

/**
 * Public, unauthenticated gate-pass scan page. Opened by scanning the QR on a
 * sale's printed invoice or a purchase's gate pass — the token in the URL is
 * the credential, so this page (and the backend routes it calls) needs no
 * login. A gate/security person uses it to see what's moving and confirm the
 * pass was scanned, for goods going out (sale) or coming in (purchase).
 */

interface GatePassCustomer {
  name?: string;
  phone?: string;
}

interface GatePassItem {
  name: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
}

interface GatePassDetail {
  id: string;
  number: string;
  sourceType?: 'SALE' | 'PURCHASE';
  direction?: 'IN' | 'OUT';
  saleNumber: string;
  saleDate: string;
  customer?: GatePassCustomer;
  items: GatePassItem[];
  pricing: { subtotal: number; discount: number; tax: number; total: number };
  status: 'ACTIVE' | 'USED' | 'CANCELLED';
  scannedAt?: string;
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}

export function GatePassScanPage() {
  const { token = '' } = useParams();
  const qc = useQueryClient();
  const [loadError, setLoadError] = useState<string | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);

  const { data, isLoading } = useQuery<GatePassDetail>({
    queryKey: ['public-gate-pass', token],
    queryFn: async () => {
      try {
        const res = await api.get(`/gate-passes/public/${token}`);
        setLoadError(null);
        return res.data;
      } catch (e: any) {
        setLoadError(e?.response?.data?.message ?? 'Invalid or expired gate pass link.');
        throw e;
      }
    },
    retry: false,
    enabled: Boolean(token),
  });

  const scan = useMutation({
    mutationFn: async () => (await api.post(`/gate-passes/public/${token}/scan`)).data,
    onSuccess: (updated) => {
      setScanError(null);
      qc.setQueryData(['public-gate-pass', token], updated);
    },
    onError: (e: any) => setScanError(e?.response?.data?.message ?? 'Could not confirm scan.'),
  });

  const isPurchase = data?.sourceType === 'PURCHASE';
  const docLabel = isPurchase ? 'Purchase #' : 'Sale #';
  const partyLabel = isPurchase ? 'Vendor' : 'Customer';
  const directionLabel = isPurchase ? 'Goods In' : 'Goods Out';

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
      <Card className="w-full max-w-md space-y-4 p-6">
        <div className="text-center">
          <PackageCheck className="mx-auto mb-2 h-8 w-8 text-primary" />
          <h1 className="text-lg font-semibold">Gate Pass Verification</h1>
          {data && (
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              {directionLabel}
            </p>
          )}
        </div>

        {isLoading && <p className="text-center text-sm text-muted-foreground">Loading…</p>}

        {!isLoading && loadError && !data && (
          <div className="flex flex-col items-center gap-2 py-4 text-center text-sm text-destructive">
            <XCircle className="h-6 w-6" />
            {loadError}
          </div>
        )}

        {data && (
          <>
            <div className="space-y-1 text-sm">
              <Row label="Gate Pass #" value={data.number} />
              <Row label={docLabel} value={data.saleNumber} />
              <Row label="Date" value={new Date(data.saleDate).toLocaleString()} />
              <Row label={partyLabel} value={data.customer?.name ?? '—'} />
            </div>

            <div className="overflow-hidden rounded-lg border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="px-3 py-2 font-medium">Item</th>
                    <th className="px-3 py-2 text-right font-medium">Qty</th>
                    <th className="px-3 py-2 text-right font-medium">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((it, idx) => (
                    <tr key={idx} className="border-b last:border-0">
                      <td className="px-3 py-2">{it.name}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{it.quantity}</td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {formatCurrency(it.lineTotal)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex items-center justify-between text-sm font-semibold">
              <span>Total</span>
              <span>{formatCurrency(data.pricing.total)}</span>
            </div>

            {data.status === 'ACTIVE' && (
              <Button className="w-full" disabled={scan.isPending} onClick={() => scan.mutate()}>
                {scan.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                Confirm Gate Scan
              </Button>
            )}

            {data.status === 'USED' && (
              <div className="flex flex-col items-center gap-1 rounded-lg bg-success/10 p-3 text-center text-sm text-success">
                <CheckCircle2 className="h-6 w-6" />
                Scanned{data.scannedAt ? ` at ${new Date(data.scannedAt).toLocaleString()}` : ''}
              </div>
            )}

            {data.status === 'CANCELLED' && (
              <div className="flex flex-col items-center gap-1 rounded-lg bg-destructive/10 p-3 text-center text-sm text-destructive">
                <XCircle className="h-6 w-6" />
                This gate pass has been cancelled.
              </div>
            )}

            {scanError && <p className="text-center text-sm text-destructive">{scanError}</p>}
          </>
        )}
      </Card>
    </div>
  );
}
