import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Loader2, LockKeyhole, PackageCheck, XCircle } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SignaturePad } from '@/components/signature-pad';
import { api } from '@/lib/api';
import { useAuthStore } from '@/store/auth';

interface GatePassItem {
  productId: string;
  name: string;
  sku?: string;
  barcode?: string;
  quantity: number;
  loadedQuantity?: number;
  loadConfirmed?: boolean;
}

interface GatePassDetail {
  id: string;
  number: string;
  sourceType?: 'SALE' | 'PURCHASE';
  saleNumber: string;
  saleDate: string;
  items: GatePassItem[];
  driver?: {
    name: string;
    phone?: string;
    licenseNumber?: string;
    vehicleNumber: string;
  };
  loadNotes?: string;
  status: 'PENDING' | 'PROCESSED' | 'CANCELLED';
  processedAt?: string;
  processedBy?: { name?: string };
}

type LoadedItem = Pick<GatePassItem, 'productId' | 'loadedQuantity' | 'loadConfirmed'>;

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium">{value}</span>
    </div>
  );
}

export function GatePassScanPage() {
  const { token = '' } = useParams();
  const qc = useQueryClient();
  const user = useAuthStore((state) => state.user);
  const login = useAuthStore((state) => state.login);
  const [credentials, setCredentials] = useState({ email: '', password: '' });
  const [loginError, setLoginError] = useState('');
  const [driver, setDriver] = useState({
    name: '',
    phone: '',
    licenseNumber: '',
    vehicleNumber: '',
  });
  const [items, setItems] = useState<LoadedItem[]>([]);
  const [loadNotes, setLoadNotes] = useState('');
  const [signatureData, setSignatureData] = useState<string | null>(null);

  const { data, isLoading, error } = useQuery<GatePassDetail>({
    queryKey: ['public-gate-pass', token],
    queryFn: async () => (await api.get(`/gate-passes/public/${token}`)).data,
    retry: false,
    enabled: Boolean(token),
  });

  useEffect(() => {
    if (!data || items.length) return;
    setItems(
      data.items.map((item) => ({
        productId: item.productId,
        loadedQuantity: item.loadedQuantity ?? item.quantity,
        loadConfirmed: item.loadConfirmed ?? false,
      })),
    );
  }, [data, items.length]);

  const signIn = useMutation({
    mutationFn: () => login(credentials.email, credentials.password),
    onSuccess: () => setLoginError(''),
    onError: (e: any) =>
      setLoginError(e?.response?.data?.message ?? 'Could not sign in with those credentials.'),
  });

  const processPass = useMutation({
    mutationFn: async () =>
      (
        await api.post(`/gate-passes/public/${token}/process`, {
          driver,
          items,
          loadNotes,
          signatureData,
        })
      ).data,
    onSuccess: (updated) => qc.setQueryData(['public-gate-pass', token], updated),
  });

  const updateItem = (index: number, patch: Partial<LoadedItem>) =>
    setItems((current) =>
      current.map((item, itemIndex) => (itemIndex === index ? { ...item, ...patch } : item)),
    );

  const allConfirmed =
    Boolean(data?.items.length) &&
    data!.items.every(
      (item, index) =>
        items[index]?.loadConfirmed &&
        Number(items[index]?.loadedQuantity) === Number(item.quantity),
    );
  const canProcess =
    driver.name.trim() &&
    driver.vehicleNumber.trim() &&
    signatureData &&
    allConfirmed &&
    !processPass.isPending;
  const apiError = (error as any)?.response?.data?.message;
  const processError = (processPass.error as any)?.response?.data?.message;

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
      <Card className="w-full max-w-xl space-y-5 p-6">
        <div className="text-center">
          <PackageCheck className="mx-auto mb-2 h-8 w-8 text-primary" />
          <h1 className="text-lg font-semibold">Gate Pass</h1>
          {data && (
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              {data.sourceType === 'PURCHASE' ? 'Goods In' : 'Goods Out'}
            </p>
          )}
        </div>

        {isLoading && <p className="text-center text-sm text-muted-foreground">Loading…</p>}
        {!isLoading && !data && (
          <div className="flex flex-col items-center gap-2 py-4 text-center text-sm text-destructive">
            <XCircle className="h-6 w-6" />
            {apiError ?? 'Invalid or expired gate pass link.'}
          </div>
        )}

        {data && (
          <>
            <div className="space-y-1 text-sm">
              <Row label="Gate Pass #" value={data.number} />
              <Row
                label={data.sourceType === 'PURCHASE' ? 'Purchase #' : 'Sale #'}
                value={data.saleNumber}
              />
              <Row label="Date" value={new Date(data.saleDate).toLocaleString()} />
            </div>

            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="px-3 py-2 font-medium">Product</th>
                    <th className="px-3 py-2 text-right font-medium">Gate Qty</th>
                    {data.status === 'PROCESSED' && (
                      <th className="px-3 py-2 text-right font-medium">Loaded</th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((item) => (
                    <tr key={item.productId} className="border-b last:border-0">
                      <td className="px-3 py-2">
                        <div>{item.name}</div>
                        {item.sku && (
                          <div className="text-xs text-muted-foreground">{item.sku}</div>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">{item.quantity}</td>
                      {data.status === 'PROCESSED' && (
                        <td className="px-3 py-2 text-right tabular-nums">{item.loadedQuantity}</td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {data.status === 'PENDING' && !user && (
              <form
                className="space-y-3 rounded-lg border p-4"
                onSubmit={(event) => {
                  event.preventDefault();
                  signIn.mutate();
                }}
              >
                <div className="flex items-center gap-2 text-sm font-medium">
                  <LockKeyhole className="h-4 w-4" />
                  Sign in to process this gate pass
                </div>
                <Input
                  type="email"
                  required
                  placeholder="Email"
                  value={credentials.email}
                  onChange={(event) =>
                    setCredentials((current) => ({ ...current, email: event.target.value }))
                  }
                />
                <Input
                  type="password"
                  required
                  placeholder="Password"
                  value={credentials.password}
                  onChange={(event) =>
                    setCredentials((current) => ({ ...current, password: event.target.value }))
                  }
                />
                {loginError && <p className="text-sm text-destructive">{loginError}</p>}
                <Button className="w-full" disabled={signIn.isPending}>
                  {signIn.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                  Sign In
                </Button>
              </form>
            )}

            {data.status === 'PENDING' && user && (
              <form
                className="space-y-5"
                onSubmit={(event) => {
                  event.preventDefault();
                  if (canProcess) processPass.mutate();
                }}
              >
                <div className="grid gap-3 sm:grid-cols-2">
                  {[
                    ['Driver name', 'name'],
                    ['Vehicle number', 'vehicleNumber'],
                    ['Driver phone', 'phone'],
                    ['License number', 'licenseNumber'],
                  ].map(([label, key]) => (
                    <div key={key} className="space-y-1">
                      <Label>{label}</Label>
                      <Input
                        required={key === 'name' || key === 'vehicleNumber'}
                        value={driver[key as keyof typeof driver]}
                        onChange={(event) =>
                          setDriver((current) => ({ ...current, [key]: event.target.value }))
                        }
                      />
                    </div>
                  ))}
                </div>

                <div className="space-y-2">
                  <Label>Confirm vehicle load</Label>
                  {data.items.map((item, index) => (
                    <div
                      key={item.productId}
                      className="grid grid-cols-[1fr_6rem_auto] items-center gap-2 rounded-md border p-2 text-sm"
                    >
                      <span>{item.name}</span>
                      <Input
                        type="number"
                        min="0"
                        step="any"
                        aria-label={`Loaded quantity for ${item.name}`}
                        value={items[index]?.loadedQuantity ?? ''}
                        onChange={(event) =>
                          updateItem(index, { loadedQuantity: Number(event.target.value) })
                        }
                      />
                      <input
                        type="checkbox"
                        className="h-4 w-4"
                        aria-label={`Confirm ${item.name}`}
                        checked={items[index]?.loadConfirmed ?? false}
                        onChange={(event) =>
                          updateItem(index, { loadConfirmed: event.target.checked })
                        }
                      />
                    </div>
                  ))}
                  {!allConfirmed && (
                    <p className="text-xs text-muted-foreground">
                      Each loaded quantity must match the gate quantity and be checked.
                    </p>
                  )}
                </div>

                <div className="space-y-1">
                  <Label>Load notes (optional)</Label>
                  <textarea
                    className="min-h-20 w-full rounded-md border bg-transparent px-3 py-2 text-sm"
                    maxLength={1000}
                    value={loadNotes}
                    onChange={(event) => setLoadNotes(event.target.value)}
                  />
                </div>

                <div className="space-y-1">
                  <Label>Digital signature</Label>
                  <SignaturePad onChange={setSignatureData} />
                </div>

                {processError && <p className="text-sm text-destructive">{processError}</p>}
                <Button className="w-full" disabled={!canProcess}>
                  {processPass.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                  Process Gate Pass
                </Button>
              </form>
            )}

            {data.status === 'PROCESSED' && (
              <div className="space-y-3 rounded-lg bg-success/10 p-4 text-sm">
                <div className="flex flex-col items-center gap-1 text-center text-success">
                  <CheckCircle2 className="h-6 w-6" />
                  <span className="font-medium">Already processed</span>
                  {data.processedAt && <span>{new Date(data.processedAt).toLocaleString()}</span>}
                </div>
                {data.driver && (
                  <div className="space-y-1 border-t pt-3">
                    <Row label="Driver" value={data.driver.name} />
                    <Row label="Vehicle" value={data.driver.vehicleNumber} />
                    {data.driver.phone && <Row label="Phone" value={data.driver.phone} />}
                    {data.driver.licenseNumber && (
                      <Row label="License" value={data.driver.licenseNumber} />
                    )}
                  </div>
                )}
              </div>
            )}

            {data.status === 'CANCELLED' && (
              <div className="flex flex-col items-center gap-1 rounded-lg bg-destructive/10 p-3 text-center text-sm text-destructive">
                <XCircle className="h-6 w-6" />
                This gate pass has been cancelled.
              </div>
            )}
          </>
        )}
      </Card>
    </div>
  );
}
