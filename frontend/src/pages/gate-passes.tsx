import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Clock3, Pencil } from 'lucide-react';
import { toast } from 'sonner';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { SignaturePad } from '@/components/signature-pad';
import { api } from '@/lib/api';

interface GatePassItem {
  productId: string;
  name: string;
  sku?: string;
  quantity: number;
  loadedQuantity?: number;
  loadConfirmed?: boolean;
}

interface GatePass {
  id: string;
  number: string;
  sourceType: 'SALE' | 'PURCHASE';
  saleNumber: string;
  saleDate: string;
  status: 'PENDING' | 'PROCESSED' | 'CANCELLED';
  items: GatePassItem[];
  driver?: {
    name: string;
    phone?: string;
    licenseNumber?: string;
    vehicleNumber: string;
  };
  loadNotes?: string;
  processedAt?: string;
  processedBy?: { name?: string };
  lastEditedAt?: string;
}

function EditGatePass({ gatePass, onClose }: { gatePass: GatePass | null; onClose: () => void }) {
  const qc = useQueryClient();
  const [driver, setDriver] = useState({
    name: '',
    phone: '',
    licenseNumber: '',
    vehicleNumber: '',
  });
  const [loadNotes, setLoadNotes] = useState('');
  const [items, setItems] = useState<GatePassItem[]>([]);
  const [signatureData, setSignatureData] = useState<string | null>(null);

  useEffect(() => {
    if (!gatePass) return;
    setDriver({
      name: gatePass.driver?.name ?? '',
      phone: gatePass.driver?.phone ?? '',
      licenseNumber: gatePass.driver?.licenseNumber ?? '',
      vehicleNumber: gatePass.driver?.vehicleNumber ?? '',
    });
    setLoadNotes(gatePass.loadNotes ?? '');
    setItems(gatePass.items);
    setSignatureData(null);
  }, [gatePass]);

  const save = useMutation({
    mutationFn: async () =>
      (
        await api.patch(`/gate-passes/${gatePass!.id}`, {
          driver,
          loadNotes,
          items: items.map((item) => ({
            productId: item.productId,
            loadedQuantity: item.loadedQuantity,
            loadConfirmed: item.loadConfirmed,
          })),
          ...(signatureData ? { signatureData } : {}),
        })
      ).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['gate-passes'] });
      toast.success('Gate pass updated');
      onClose();
    },
    onError: (error: any) =>
      toast.error(error?.response?.data?.message ?? 'Could not update gate pass'),
  });

  return (
    <Dialog open={Boolean(gatePass)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit processed gate pass</DialogTitle>
          <DialogDescription>
            Admin corrections are timestamped. Leave the signature blank to retain the existing
            signature.
          </DialogDescription>
        </DialogHeader>
        {gatePass && (
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              save.mutate();
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
              <Label>Loaded products</Label>
              {items.map((item, index) => (
                <div
                  key={item.productId}
                  className="grid grid-cols-[1fr_6rem_auto] items-center gap-2 rounded-md border p-2 text-sm"
                >
                  <span>
                    {item.name} (gate qty {item.quantity})
                  </span>
                  <Input
                    type="number"
                    step="any"
                    min="0"
                    value={item.loadedQuantity ?? ''}
                    onChange={(event) =>
                      setItems((current) =>
                        current.map((value, itemIndex) =>
                          itemIndex === index
                            ? { ...value, loadedQuantity: Number(event.target.value) }
                            : value,
                        ),
                      )
                    }
                  />
                  <input
                    type="checkbox"
                    className="h-4 w-4"
                    checked={item.loadConfirmed ?? false}
                    onChange={(event) =>
                      setItems((current) =>
                        current.map((value, itemIndex) =>
                          itemIndex === index
                            ? { ...value, loadConfirmed: event.target.checked }
                            : value,
                        ),
                      )
                    }
                  />
                </div>
              ))}
            </div>

            <div className="space-y-1">
              <Label>Load notes</Label>
              <textarea
                className="min-h-20 w-full rounded-md border bg-transparent px-3 py-2 text-sm"
                maxLength={1000}
                value={loadNotes}
                onChange={(event) => setLoadNotes(event.target.value)}
              />
            </div>

            <div className="space-y-1">
              <Label>Replacement signature (optional)</Label>
              <SignaturePad onChange={setSignatureData} />
            </div>

            <Button className="w-full" disabled={save.isPending}>
              Save Admin Correction
            </Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function GatePassesPage() {
  const [status, setStatus] = useState<'ALL' | 'PENDING' | 'PROCESSED'>('ALL');
  const [editing, setEditing] = useState<GatePass | null>(null);
  const { data, isLoading } = useQuery<{
    gatePasses: GatePass[];
    total: number;
  }>({
    queryKey: ['gate-passes', status],
    queryFn: async () =>
      (
        await api.get('/gate-passes', {
          params: { limit: 100, ...(status === 'ALL' ? {} : { status }) },
        })
      ).data,
  });
  const gatePasses = data?.gatePasses ?? [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Gate Passes</h1>
          <p className="text-sm text-muted-foreground">
            Review pending and processed vehicle loads.
          </p>
        </div>
        <div className="flex gap-2">
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
              <th className="px-4 py-3 font-medium">Driver / Vehicle</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 text-right font-medium">Action</th>
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
            {!isLoading && gatePasses.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">
                  No gate passes found.
                </td>
              </tr>
            )}
            {gatePasses.map((gatePass) => (
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
                  {gatePass.driver ? (
                    <>
                      <div>{gatePass.driver.name}</div>
                      <div>{gatePass.driver.vehicleNumber}</div>
                    </>
                  ) : (
                    '—'
                  )}
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
                  {gatePass.status === 'PROCESSED' && (
                    <Button size="sm" variant="outline" onClick={() => setEditing(gatePass)}>
                      <Pencil className="h-4 w-4" />
                      Edit
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <EditGatePass gatePass={editing} onClose={() => setEditing(null)} />
    </div>
  );
}
