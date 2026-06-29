import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, Printer, Loader2, Search, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { api } from '@/lib/api';
import { formatCurrency } from '@/lib/utils';
import { printDocument, type TemplateType } from '@/lib/printing';
import { useWarehouses } from '@/components/layout/warehouse-switcher';

interface Vendor {
  id: string;
  name: string;
}
interface Product {
  id: string;
  name: string;
  sku: string;
  purchasePrice: string;
  currentStock: number;
}
interface Line {
  productId: string;
  name: string;
  quantity: number;
  rate: number;
  taxRate: number;
  discount: number;
}

const GP_FORMATS: { label: string; type: TemplateType }[] = [
  { label: 'Divider Paper', type: 'GP_DIVIDER' },
  { label: 'A4 Half', type: 'GP_A4_HALF' },
  { label: 'Full A4', type: 'GP_A4_FULL' },
];

// Auto-generated default for the vendor-invoice field (editable, date+time based).
function genVendorInvoiceNo() {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `VINV-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

export function PurchasesPage() {
  const qc = useQueryClient();
  const [vendorId, setVendorId] = useState('');
  const [invoiceNumber, setInvoiceNumber] = useState(genVendorInvoiceNo);
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [lines, setLines] = useState<Line[]>([]);
  const [paidAmount, setPaidAmount] = useState(0);
  const [search, setSearch] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [lastGp, setLastGp] = useState<any>(null);
  const { currentId: warehouseId, warehouses } = useWarehouses();
  const warehouseName = warehouses.find((w) => w.id === warehouseId)?.name ?? '—';

  const { data: vendors = [] } = useQuery<Vendor[]>({
    queryKey: ['vendors-select'],
    queryFn: async () => (await api.get('/vendors')).data,
  });
  // Always load products (empty search returns the catalog); the dropdown is
  // toggled by focus so you can browse the full list without typing.
  const { data: products = [] } = useQuery<Product[]>({
    queryKey: ['gp-products', search],
    queryFn: async () => (await api.get('/products', { params: { search } })).data,
  });

  const addLine = (p: Product) => {
    setSearch('');
    setPickerOpen(false);
    setLines((ls) => {
      if (ls.some((l) => l.productId === p.id)) return ls;
      return [
        ...ls,
        {
          productId: p.id,
          name: p.name,
          quantity: 1,
          rate: Number(p.purchasePrice),
          taxRate: 0,
          discount: 0,
        },
      ];
    });
  };

  const patchLine = (id: string, patch: Partial<Line>) =>
    setLines((ls) => ls.map((l) => (l.productId === id ? { ...l, ...patch } : l)));
  const removeLine = (id: string) => setLines((ls) => ls.filter((l) => l.productId !== id));

  const totals = useMemo(() => {
    let subtotal = 0;
    let tax = 0;
    for (const l of lines) {
      const gross = l.quantity * l.rate;
      const taxable = gross - l.discount;
      subtotal += gross;
      tax += (taxable * l.taxRate) / 100;
    }
    const discount = lines.reduce((s, l) => s + l.discount, 0);
    return { subtotal, tax, discount, grandTotal: subtotal - discount + tax };
  }, [lines]);

  const save = useMutation({
    mutationFn: async () =>
      (
        await api.post('/purchases', {
          vendorId,
          warehouseId,
          invoiceNumber: invoiceNumber || undefined,
          date,
          paidAmount,
          items: lines.map((l) => ({
            productId: l.productId,
            quantity: l.quantity,
            rate: l.rate,
            taxRate: l.taxRate,
            discount: l.discount,
          })),
        })
      ).data,
    onSuccess: (gp) => {
      toast.success(`Saved ${gp.gpNumber}`);
      setLastGp(gp);
      setLines([]);
      setPaidAmount(0);
      setInvoiceNumber(genVendorInvoiceNo()); // fresh number for the next GP
      qc.invalidateQueries({ queryKey: ['purchases'] });
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'Could not save purchase'),
  });

  const handlePrint = (type: TemplateType) => {
    const gp = lastGp;
    if (!gp) return;
    printDocument(type, {
      company: { name: 'DevInception Retail', address: 'HQ, Lahore', phone: '+92 300 1234567' },
      number: gp.gpNumber,
      date: new Date(gp.date).toLocaleDateString(),
      partyName: gp.vendor?.name,
      items: gp.items.map((i: any) => ({
        name: i.product?.name ?? '',
        qty: Number(i.quantity),
        price: Number(i.rate),
        amount: Number(i.amount),
      })),
      subtotal: Number(gp.subtotal),
      tax: Number(gp.taxTotal),
      discount: Number(gp.discountTotal),
      total: Number(gp.grandTotal),
      notes: gp.note,
    });
  };

  const canSave = vendorId && lines.length > 0 && !save.isPending;

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>New Goods Purchase</CardTitle>
            <p className="text-sm text-muted-foreground">
              Receiving into <span className="font-medium text-foreground">{warehouseName}</span>{' '}
              (switch in the top bar)
            </p>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label>Vendor *</Label>
              <select
                value={vendorId}
                onChange={(e) => setVendorId(e.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-sm focus-visible:outline-none"
              >
                <option value="">Select vendor…</option>
                {vendors.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>Vendor Invoice #</Label>
              <div className="flex gap-1">
                <Input
                  value={invoiceNumber}
                  onChange={(e) => setInvoiceNumber(e.target.value)}
                  placeholder="Auto-generated"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  title="Regenerate number"
                  onClick={() => setInvoiceNumber(genVendorInvoiceNo())}
                >
                  <RefreshCw className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Date</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onFocus={() => setPickerOpen(true)}
                // delay so a click on a result registers before closing
                onBlur={() => setTimeout(() => setPickerOpen(false), 150)}
                placeholder="Click to browse, or type to search products…"
                className="pl-8"
              />
              {pickerOpen && (
                <div className="absolute z-10 mt-1 max-h-64 w-full overflow-y-auto rounded-md border bg-popover shadow-md">
                  {products.length === 0 ? (
                    <p className="px-3 py-3 text-sm text-muted-foreground">
                      No products found{search ? ` for “${search}”` : ''}.
                    </p>
                  ) : (
                    products.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => addLine(p)}
                        className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-accent"
                      >
                        <span className="flex items-center gap-2">
                          {p.name}
                          <span className="text-xs text-muted-foreground">
                            · {p.currentStock} in stock
                          </span>
                        </span>
                        <span className="text-xs text-muted-foreground">{p.sku}</span>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-y bg-muted/50 text-left text-xs uppercase text-muted-foreground">
                  <th className="px-3 py-2 font-medium">Product</th>
                  <th className="px-3 py-2 font-medium">Qty</th>
                  <th className="px-3 py-2 font-medium">Rate</th>
                  <th className="px-3 py-2 font-medium">Disc</th>
                  <th className="px-3 py-2 font-medium">Tax%</th>
                  <th className="px-3 py-2 text-right font-medium">Amount</th>
                  <th className="w-8" />
                </tr>
              </thead>
              <tbody>
                {lines.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-3 py-8 text-center text-muted-foreground">
                      Search and add products above.
                    </td>
                  </tr>
                )}
                {lines.map((l) => {
                  const amount = l.quantity * l.rate - l.discount;
                  return (
                    <tr key={l.productId} className="border-b last:border-0">
                      <td className="px-3 py-2 font-medium">{l.name}</td>
                      <td className="px-3 py-2">
                        <Input
                          type="number"
                          className="h-8 w-20"
                          value={l.quantity}
                          onChange={(e) =>
                            patchLine(l.productId, { quantity: Number(e.target.value) })
                          }
                        />
                      </td>
                      <td className="px-3 py-2">
                        <Input
                          type="number"
                          className="h-8 w-24"
                          value={l.rate}
                          onChange={(e) => patchLine(l.productId, { rate: Number(e.target.value) })}
                        />
                      </td>
                      <td className="px-3 py-2">
                        <Input
                          type="number"
                          className="h-8 w-20"
                          value={l.discount}
                          onChange={(e) =>
                            patchLine(l.productId, { discount: Number(e.target.value) })
                          }
                        />
                      </td>
                      <td className="px-3 py-2">
                        <Input
                          type="number"
                          className="h-8 w-16"
                          value={l.taxRate}
                          onChange={(e) =>
                            patchLine(l.productId, { taxRate: Number(e.target.value) })
                          }
                        />
                      </td>
                      <td className="px-3 py-2 text-right">
                        {formatCurrency(amount + (amount * l.taxRate) / 100)}
                      </td>
                      <td className="px-3 py-2">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 text-destructive"
                          onClick={() => removeLine(l.productId)}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </div>

      {/* Summary */}
      <Card className="h-fit">
        <CardHeader>
          <CardTitle>Summary</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1.5 text-sm">
            <div className="flex justify-between text-muted-foreground">
              <span>Subtotal</span>
              <span>{formatCurrency(totals.subtotal)}</span>
            </div>
            <div className="flex justify-between text-muted-foreground">
              <span>Discount</span>
              <span>-{formatCurrency(totals.discount)}</span>
            </div>
            <div className="flex justify-between text-muted-foreground">
              <span>Tax</span>
              <span>{formatCurrency(totals.tax)}</span>
            </div>
            <div className="flex justify-between border-t pt-2 text-base font-bold">
              <span>Grand Total</span>
              <span>{formatCurrency(totals.grandTotal)}</span>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Paid now</Label>
            <Input
              type="number"
              value={paidAmount || ''}
              onChange={(e) => setPaidAmount(Number(e.target.value))}
              placeholder="0"
            />
            <p className="text-right text-xs text-muted-foreground">
              Balance: {formatCurrency(Math.max(0, totals.grandTotal - paidAmount))}
            </p>
          </div>

          <Button className="w-full" disabled={!canSave} onClick={() => save.mutate()}>
            {save.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            <Plus className="h-4 w-4" /> Save Purchase
          </Button>

          {lastGp && (
            <div className="space-y-2 rounded-lg border border-dashed p-3">
              <p className="text-xs text-muted-foreground">
                Saved <span className="font-medium text-foreground">{lastGp.gpNumber}</span> —
                print:
              </p>
              <div className="grid grid-cols-1 gap-2">
                {GP_FORMATS.map((f) => (
                  <Button
                    key={f.type}
                    variant="outline"
                    size="sm"
                    onClick={() => handlePrint(f.type)}
                  >
                    <Printer className="h-4 w-4" /> {f.label}
                  </Button>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
