import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Search,
  Plus,
  Minus,
  Trash2,
  ShoppingCart,
  Loader2,
  Paperclip,
  X,
  User,
  UserPlus,
  Check,
} from 'lucide-react';
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
} from '@/components/ui/dialog';
import { api } from '@/lib/api';
import { formatCurrency, cn } from '@/lib/utils';
import { useWarehouseStore } from '@/store/warehouse';

interface Product {
  id: string;
  name: string;
  sku: string;
  salePrice: string;
  currentStock: number;
  taxRate: string;
  warehouseId?: string;
}
interface CartLine {
  product: Product;
  qty: number;
}

type Method = 'CASH' | 'ONLINE' | 'MIXED';
// UI method → backend PaymentMethod enum
const METHOD_MAP: Record<Method, string> = {
  CASH: 'CASH',
  ONLINE: 'BANK_TRANSFER',
  MIXED: 'MIXED',
};

interface CustomerLite {
  id: string;
  name: string;
  phone?: string;
}

/* ── Pick (or quick-create) the customer for this sale ── */
function CustomerPicker({
  open,
  onOpenChange,
  onSelect,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSelect: (c: CustomerLite | null) => void;
}) {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ name: '', phone: '' });

  const { data: customers = [] } = useQuery<CustomerLite[]>({
    queryKey: ['customers', search],
    queryFn: async () => (await api.get('/customers', { params: { search } })).data,
    enabled: open,
  });

  const create = useMutation({
    mutationFn: async () => (await api.post('/customers', form)).data,
    onSuccess: (c) => {
      toast.success('Customer added');
      qc.invalidateQueries({ queryKey: ['customers'] });
      onSelect({ id: c.id, name: c.name });
      setCreating(false);
      setForm({ name: '', phone: '' });
      onOpenChange(false);
    },
    onError: () => toast.error('Could not add customer'),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Select Customer</DialogTitle>
          <DialogDescription>
            Attach this sale to a customer, or keep it as a walk-in.
          </DialogDescription>
        </DialogHeader>

        {!creating ? (
          <div className="space-y-3">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search customers…"
                className="pl-8"
                autoFocus
              />
            </div>
            <div className="max-h-64 space-y-1 overflow-y-auto">
              <button
                onClick={() => {
                  onSelect(null);
                  onOpenChange(false);
                }}
                className="flex w-full items-center gap-2 rounded-md border px-3 py-2 text-left text-sm hover:bg-accent"
              >
                <User className="h-4 w-4 text-muted-foreground" /> Walk-in Customer
              </button>
              {customers.map((c) => (
                <button
                  key={c.id}
                  onClick={() => {
                    onSelect({ id: c.id, name: c.name });
                    onOpenChange(false);
                  }}
                  className="flex w-full items-center justify-between rounded-md border px-3 py-2 text-left text-sm hover:bg-accent"
                >
                  <span className="truncate">{c.name}</span>
                  <span className="text-xs text-muted-foreground">{c.phone ?? ''}</span>
                </button>
              ))}
            </div>
            <Button variant="outline" className="w-full" onClick={() => setCreating(true)}>
              <UserPlus className="h-4 w-4" /> New customer
            </Button>
          </div>
        ) : (
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              create.mutate();
            }}
          >
            <div className="space-y-1.5">
              <Label>Name *</Label>
              <Input
                required
                autoFocus
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Phone</Label>
              <Input
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setCreating(false)}>
                Back
              </Button>
              <Button type="submit" disabled={create.isPending}>
                {create.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Check className="h-4 w-4" />
                )}
                Add &amp; select
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function PosPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [cart, setCart] = useState<CartLine[]>([]);
  const [method, setMethod] = useState<Method>('CASH');
  const [cashAmount, setCashAmount] = useState<number>(0);
  const [onlineAmount, setOnlineAmount] = useState<number>(0);
  const [receipt, setReceipt] = useState<File | null>(null);
  const [discountValue, setDiscountValue] = useState<number>(0);
  const [discountType, setDiscountType] = useState<'amount' | 'percent'>('amount');
  const [taxPct, setTaxPct] = useState<number>(0);
  const [customer, setCustomer] = useState<CustomerLite | null>(null);
  const [customerPickerOpen, setCustomerPickerOpen] = useState(false);
  const [completedSale, setCompletedSale] = useState<any | null>(null);
  const [qrImageUrl, setQrImageUrl] = useState<string | null>(null);
  const [qrLoading, setQrLoading] = useState(false);
  // Checkout still deducts from one warehouse (below), but the catalog itself
  // is business-wide — no warehouse filter when browsing/searching products.
  const defaultWarehouseId = useWarehouseStore((s) => s.currentId);

  const { data: products = [] } = useQuery<Product[]>({
    queryKey: ['pos-products', search],
    queryFn: async () => (await api.get('/products', { params: { search } })).data,
  });

  const addToCart = (product: Product) =>
    setCart((c) => {
      const found = c.find((l) => l.product.id === product.id);
      if (found) return c.map((l) => (l.product.id === product.id ? { ...l, qty: l.qty + 1 } : l));
      // A sale can only come from one warehouse — block mixing in a product
      // owned by a different one than what's already in the cart (would
      // otherwise only surface as a confusing error at checkout).
      const cartWarehouse = c[0]?.product.warehouseId;
      if (cartWarehouse && product.warehouseId && product.warehouseId !== cartWarehouse) {
        toast.error(
          `${product.name} is stocked at a different warehouse — start a new sale for it.`,
        );
        return c;
      }
      return [...c, { product, qty: 1 }];
    });

  const setQty = (id: string, qty: number) =>
    setCart((c) =>
      c.flatMap((l) => (l.product.id === id ? (qty <= 0 ? [] : [{ ...l, qty }]) : [l])),
    );

  // A sale deducts from one warehouse. Target the cart's own owning warehouse
  // (they should all match — a single register sale really is one location)
  // rather than whatever is globally "current", so checkout never rejects a
  // product as belonging to another warehouse. Legacy owner-less products (or
  // an empty cart) fall back to the global default.
  const saleWarehouseId = cart[0]?.product.warehouseId ?? defaultWarehouseId;

  const subtotal = cart.reduce((s, l) => s + Number(l.product.salePrice) * l.qty, 0);
  const discountAmount = Math.min(
    subtotal,
    discountType === 'percent' ? (subtotal * discountValue) / 100 : discountValue,
  );
  const taxTotal = ((subtotal - discountAmount) * taxPct) / 100;
  const grandTotal = Math.max(0, subtotal - discountAmount + taxTotal);

  // amounts tendered per method
  const cashIn = method === 'CASH' ? cashAmount : method === 'MIXED' ? cashAmount : 0;
  const onlineIn = method === 'ONLINE' ? grandTotal : method === 'MIXED' ? onlineAmount : 0;
  const tendered = cashIn + onlineIn;
  const change = Math.max(0, tendered - grandTotal);
  const needsReceipt = method === 'ONLINE' || (method === 'MIXED' && onlineAmount > 0);

  const reset = () => {
    setCart([]);
    setCashAmount(0);
    setOnlineAmount(0);
    setReceipt(null);
    setMethod('CASH');
    setDiscountValue(0);
    setDiscountType('amount');
    setTaxPct(0);
    setCustomer(null);
  };

  const checkout = useMutation({
    mutationFn: async () => {
      // 1) upload the transfer receipt first (if any)
      let transferReceiptUrl: string | undefined;
      if (needsReceipt && receipt) {
        const fd = new FormData();
        fd.append('file', receipt);
        transferReceiptUrl = (await api.post('/uploads', fd)).data.url;
      }
      // 2) create the sale
      const paidCash =
        method === 'CASH' ? cashAmount || grandTotal : method === 'MIXED' ? cashAmount : 0;
      const paidBank = method === 'ONLINE' ? grandTotal : method === 'MIXED' ? onlineAmount : 0;
      return (
        await api.post('/sales', {
          paymentMethod: METHOD_MAP[method],
          warehouseId: saleWarehouseId,
          customerId: customer?.id,
          paidCash,
          paidBank,
          transferReceiptUrl,
          discountTotal: discountAmount,
          items: cart.map((l) => {
            const gross = Number(l.product.salePrice) * l.qty;
            // spread the cart discount across lines so tax is charged on the net amount
            const lineDiscount = subtotal > 0 ? (discountAmount * gross) / subtotal : 0;
            return {
              productId: l.product.id,
              quantity: l.qty,
              unitPrice: Number(l.product.salePrice),
              discount: lineDiscount,
              taxRate: taxPct,
            };
          }),
        })
      ).data;
    },
    onSuccess: async (sale) => {
      toast.success(`Sale ${sale.saleNumber} completed`);
      qc.invalidateQueries({ queryKey: ['pos-products'] });
      setCompletedSale(sale);
      if (sale.gatePassQrUrl) {
        setQrLoading(true);
        try {
          const res = await api.get(sale.gatePassQrUrl, { responseType: 'blob' });
          setQrImageUrl(URL.createObjectURL(res.data));
        } catch {
          toast.error('Sale completed, but the gate pass QR could not be loaded');
        } finally {
          setQrLoading(false);
        }
      }
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'Checkout failed'),
  });

  const closeReceipt = () => {
    if (qrImageUrl) URL.revokeObjectURL(qrImageUrl);
    setQrImageUrl(null);
    setCompletedSale(null);
    reset();
  };

  // guard: require a receipt for online payments; mixed split must cover the total
  const mixedShort = method === 'MIXED' && cashAmount + onlineAmount + 0.001 < grandTotal;
  const cashShort = method === 'CASH' && cashAmount > 0 && cashAmount + 0.001 < grandTotal;
  const canCharge =
    cart.length > 0 &&
    !checkout.isPending &&
    (!needsReceipt || !!receipt) &&
    !mixedShort &&
    !cashShort;

  return (
    <div className="grid h-[calc(100vh-7rem)] gap-4 lg:grid-cols-[1fr_380px]">
      {/* Catalog */}
      <div className="flex flex-col gap-4 overflow-hidden">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            autoFocus
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Scan barcode or search product…"
            className="h-11 pl-9"
          />
        </div>
        <div className="grid flex-1 grid-cols-2 content-start gap-3 overflow-y-auto pr-1 sm:grid-cols-3 xl:grid-cols-4">
          {products.map((p) => (
            <button
              key={p.id}
              onClick={() => addToCart(p)}
              disabled={p.currentStock <= 0}
              className={cn(
                'flex flex-col items-start rounded-lg border bg-card p-3 text-left transition hover:border-primary hover:shadow-sm',
                p.currentStock <= 0 && 'opacity-50',
              )}
            >
              <div className="mb-2 flex h-16 w-full items-center justify-center rounded-md bg-muted text-muted-foreground">
                <ShoppingCart className="h-5 w-5" />
              </div>
              <p className="line-clamp-2 text-sm font-medium">{p.name}</p>
              <p className="text-xs text-muted-foreground">{p.sku}</p>
              <div className="mt-1 flex w-full items-center justify-between">
                <span className="font-semibold text-primary">
                  {formatCurrency(Number(p.salePrice))}
                </span>
                <span className="text-xs text-muted-foreground">{p.currentStock} left</span>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Cart */}
      <Card className="flex flex-col overflow-hidden">
        <div className="space-y-2 border-b p-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Current Sale</h2>
            <span className="text-xs text-muted-foreground">{cart.length} item(s)</span>
          </div>
          <button
            onClick={() => setCustomerPickerOpen(true)}
            className="flex w-full items-center gap-2 rounded-md border px-3 py-2 text-left text-sm transition hover:bg-accent"
          >
            <User className="h-4 w-4 text-muted-foreground" />
            <span className="flex-1 truncate">{customer?.name ?? 'Walk-in Customer'}</span>
            <span className="text-xs text-primary">Change</span>
          </button>
        </div>

        <div className="flex-1 space-y-2 overflow-y-auto p-4">
          {cart.length === 0 && (
            <div className="flex h-full flex-col items-center justify-center text-muted-foreground">
              <ShoppingCart className="mb-2 h-8 w-8" />
              <p className="text-sm">Cart is empty</p>
            </div>
          )}
          {cart.map((l) => (
            <div key={l.product.id} className="flex items-center gap-2 rounded-md border p-2">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{l.product.name}</p>
                <p className="text-xs text-muted-foreground">
                  {formatCurrency(Number(l.product.salePrice))}
                </p>
              </div>
              <div className="flex items-center gap-1">
                <Button
                  size="icon"
                  variant="outline"
                  className="h-7 w-7"
                  onClick={() => setQty(l.product.id, l.qty - 1)}
                >
                  <Minus className="h-3 w-3" />
                </Button>
                <span className="w-7 text-center text-sm">{l.qty}</span>
                <Button
                  size="icon"
                  variant="outline"
                  className="h-7 w-7"
                  onClick={() => setQty(l.product.id, l.qty + 1)}
                >
                  <Plus className="h-3 w-3" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7 text-destructive"
                  onClick={() => setQty(l.product.id, 0)}
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            </div>
          ))}
        </div>

        <div className="space-y-3 border-t p-4">
          {/* Discount & Tax controls */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="w-16 shrink-0 text-sm text-muted-foreground">Discount</span>
              <div className="flex overflow-hidden rounded-md border">
                <button
                  type="button"
                  onClick={() => setDiscountType('amount')}
                  className={cn(
                    'px-2.5 text-xs font-medium',
                    discountType === 'amount'
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground',
                  )}
                >
                  Rs
                </button>
                <button
                  type="button"
                  onClick={() => setDiscountType('percent')}
                  className={cn(
                    'px-2.5 text-xs font-medium',
                    discountType === 'percent'
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground',
                  )}
                >
                  %
                </button>
              </div>
              <Input
                type="number"
                min={0}
                placeholder="0"
                value={discountValue || ''}
                onChange={(e) => setDiscountValue(Number(e.target.value))}
                className="h-8"
              />
            </div>
            <div className="flex items-center gap-2">
              <span className="w-16 shrink-0 text-sm text-muted-foreground">Tax %</span>
              <Input
                type="number"
                min={0}
                placeholder="0"
                value={taxPct || ''}
                onChange={(e) => setTaxPct(Number(e.target.value))}
                className="h-8"
              />
            </div>
          </div>

          {/* Breakdown */}
          <div className="space-y-1 border-t pt-3 text-sm">
            <div className="flex justify-between text-muted-foreground">
              <span>Subtotal</span>
              <span>{formatCurrency(subtotal)}</span>
            </div>
            {discountAmount > 0 && (
              <div className="flex justify-between text-muted-foreground">
                <span>Discount{discountType === 'percent' ? ` (${discountValue}%)` : ''}</span>
                <span>−{formatCurrency(discountAmount)}</span>
              </div>
            )}
            <div className="flex justify-between text-muted-foreground">
              <span>Tax{taxPct > 0 ? ` (${taxPct}%)` : ''}</span>
              <span>{formatCurrency(taxTotal)}</span>
            </div>
            <div className="flex justify-between text-base font-bold">
              <span>Total</span>
              <span>{formatCurrency(grandTotal)}</span>
            </div>
          </div>

          {/* Payment method */}
          <div className="grid grid-cols-3 gap-2">
            {(['CASH', 'ONLINE', 'MIXED'] as const).map((m) => (
              <Button
                key={m}
                variant={method === m ? 'default' : 'outline'}
                size="sm"
                onClick={() => setMethod(m)}
              >
                {m === 'ONLINE' ? 'Online' : m === 'CASH' ? 'Cash' : 'Mixed'}
              </Button>
            ))}
          </div>

          {/* Cash only */}
          {method === 'CASH' && (
            <div className="space-y-1">
              <Input
                type="number"
                placeholder="Cash received"
                value={cashAmount || ''}
                onChange={(e) => setCashAmount(Number(e.target.value))}
              />
              {cashAmount > 0 && (
                <p
                  className={cn(
                    'text-right text-xs',
                    cashShort ? 'text-destructive' : 'text-muted-foreground',
                  )}
                >
                  {cashShort
                    ? `Amount does not match total. Short by ${formatCurrency(grandTotal - cashAmount)}`
                    : `Change: ${formatCurrency(change)}`}
                </p>
              )}
            </div>
          )}

          {/* Mixed: split cash + online */}
          {method === 'MIXED' && (
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Cash</label>
                <Input
                  type="number"
                  placeholder="0"
                  value={cashAmount || ''}
                  onChange={(e) => setCashAmount(Number(e.target.value))}
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Online transfer</label>
                <Input
                  type="number"
                  placeholder="0"
                  value={onlineAmount || ''}
                  onChange={(e) => setOnlineAmount(Number(e.target.value))}
                />
              </div>
              <p
                className={cn(
                  'col-span-2 text-right text-xs',
                  mixedShort ? 'text-destructive' : 'text-muted-foreground',
                )}
              >
                {mixedShort
                  ? `Short by ${formatCurrency(grandTotal - cashAmount - onlineAmount)}`
                  : `Tendered ${formatCurrency(cashAmount + onlineAmount)} · Change ${formatCurrency(change)}`}
              </p>
            </div>
          )}

          {/* Online transfer note */}
          {method === 'ONLINE' && (
            <p className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
              Online transfer of{' '}
              <span className="font-medium text-foreground">{formatCurrency(grandTotal)}</span> —
              attach the payment receipt below.
            </p>
          )}

          {/* Receipt attachment for online / mixed-online */}
          {needsReceipt && (
            <div className="space-y-1">
              {!receipt ? (
                <label className="flex cursor-pointer items-center justify-center gap-2 rounded-md border border-dashed py-2 text-sm text-muted-foreground hover:bg-accent">
                  <Paperclip className="h-4 w-4" />
                  Attach transfer receipt
                  <input
                    type="file"
                    accept="image/*,application/pdf"
                    className="hidden"
                    onChange={(e) => setReceipt(e.target.files?.[0] ?? null)}
                  />
                </label>
              ) : (
                <div className="flex items-center justify-between rounded-md border bg-muted/40 px-3 py-2 text-sm">
                  <span className="flex items-center gap-2 truncate">
                    <Paperclip className="h-4 w-4 shrink-0" />
                    <span className="truncate">{receipt.name}</span>
                  </span>
                  <button
                    onClick={() => setReceipt(null)}
                    className="text-muted-foreground hover:text-destructive"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              )}
              {needsReceipt && !receipt && (
                <p className="text-xs text-amber-500">Receipt required for online payment.</p>
              )}
            </div>
          )}

          <Button
            className="h-11 w-full text-base"
            disabled={!canCharge}
            onClick={() => checkout.mutate()}
          >
            {checkout.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Charge {formatCurrency(grandTotal)}
          </Button>
        </div>
      </Card>

      <CustomerPicker
        open={customerPickerOpen}
        onOpenChange={setCustomerPickerOpen}
        onSelect={setCustomer}
      />

      <Dialog open={!!completedSale} onOpenChange={(open) => !open && closeReceipt()}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Sale {completedSale?.saleNumber} completed</DialogTitle>
            <DialogDescription>
              Total {formatCurrency(completedSale?.grandTotal ?? 0)} — show this gate pass QR code
              at the warehouse exit.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col items-center gap-3 py-2">
            {qrLoading && <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />}
            {!qrLoading && qrImageUrl && (
              <img
                src={qrImageUrl}
                alt="Gate pass QR code"
                className="h-56 w-56 rounded-md border"
              />
            )}
            {!qrLoading && !qrImageUrl && (
              <p className="text-sm text-muted-foreground">
                No gate pass QR available for this sale.
              </p>
            )}
          </div>
          <Button className="w-full" onClick={closeReceipt}>
            New Sale
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
