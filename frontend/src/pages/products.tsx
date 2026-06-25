import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Search, Plus, AlertTriangle, Loader2, PackagePlus } from 'lucide-react';
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
import { useWarehouses } from '@/components/layout/warehouse-switcher';

interface Product {
  id: string;
  name: string;
  sku: string;
  barcode?: string;
  salePrice: string;
  purchasePrice: string;
  taxRate: string;
  minStock: string;
  currentStock: number;
  isLowStock: boolean;
  categoryId?: string;
  unitId?: string;
  category?: { name: string };
  unit?: { abbreviation: string };
}

interface Catalog {
  categories: { id: string; name: string }[];
  brands: { id: string; name: string }[];
  units: { id: string; name: string; abbreviation: string }[];
}

const blank = {
  name: '', sku: '', barcode: '', categoryId: '', unitId: '',
  purchasePrice: 0, salePrice: 0, taxRate: 0, minStock: 0,
};

/* ── Add / edit a product ── */
function ProductDialog({ open, onOpenChange, editing }: { open: boolean; onOpenChange: (v: boolean) => void; editing: Product | null }) {
  const qc = useQueryClient();
  const { data: catalog } = useQuery<Catalog>({ queryKey: ['catalog'], queryFn: async () => (await api.get('/catalog')).data });
  const [form, setForm] = useState(() =>
    editing
      ? {
          name: editing.name, sku: editing.sku, barcode: editing.barcode ?? '',
          categoryId: editing.categoryId ?? '', unitId: editing.unitId ?? '',
          purchasePrice: Number(editing.purchasePrice), salePrice: Number(editing.salePrice),
          taxRate: Number(editing.taxRate), minStock: Number(editing.minStock),
        }
      : blank,
  );

  const save = useMutation({
    mutationFn: async () => {
      const payload = { ...form, categoryId: form.categoryId || undefined, unitId: form.unitId || undefined, barcode: form.barcode || undefined };
      return editing ? (await api.patch(`/products/${editing.id}`, payload)).data : (await api.post('/products', payload)).data;
    },
    onSuccess: () => {
      toast.success(editing ? 'Product updated' : 'Product created — use “Stock In” to add quantity');
      qc.invalidateQueries({ queryKey: ['products'] });
      onOpenChange(false);
    },
    onError: (e: any) => toast.error(e?.response?.data?.message?.[0] ?? e?.response?.data?.message ?? 'Save failed'),
  });

  const field = (k: keyof typeof form, v: any) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{editing ? 'Edit Product' : 'New Product'}</DialogTitle>
          <DialogDescription>{editing ? 'Update product details.' : 'Add a product to your catalog (stock is added separately).'}</DialogDescription>
        </DialogHeader>
        <form className="grid grid-cols-2 gap-3" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
          <div className="col-span-2 space-y-1.5"><Label>Name *</Label><Input required value={form.name} onChange={(e) => field('name', e.target.value)} /></div>
          <div className="space-y-1.5"><Label>SKU *</Label><Input required value={form.sku} onChange={(e) => field('sku', e.target.value)} disabled={!!editing} /></div>
          <div className="space-y-1.5"><Label>Barcode</Label><Input value={form.barcode} onChange={(e) => field('barcode', e.target.value)} /></div>
          <div className="space-y-1.5">
            <Label>Category</Label>
            <select value={form.categoryId} onChange={(e) => field('categoryId', e.target.value)} className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm">
              <option value="">—</option>
              {catalog?.categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label>Unit</Label>
            <select value={form.unitId} onChange={(e) => field('unitId', e.target.value)} className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm">
              <option value="">—</option>
              {catalog?.units.map((u) => <option key={u.id} value={u.id}>{u.name} ({u.abbreviation})</option>)}
            </select>
          </div>
          <div className="space-y-1.5"><Label>Purchase Price *</Label><Input type="number" step="0.01" required value={form.purchasePrice} onChange={(e) => field('purchasePrice', Number(e.target.value))} /></div>
          <div className="space-y-1.5"><Label>Sale Price *</Label><Input type="number" step="0.01" required value={form.salePrice} onChange={(e) => field('salePrice', Number(e.target.value))} /></div>
          <div className="space-y-1.5"><Label>Tax %</Label><Input type="number" step="0.01" value={form.taxRate} onChange={(e) => field('taxRate', Number(e.target.value))} /></div>
          <div className="space-y-1.5"><Label>Min Stock</Label><Input type="number" value={form.minStock} onChange={(e) => field('minStock', Number(e.target.value))} /></div>
          <div className="col-span-2 flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={save.isPending}>{save.isPending && <Loader2 className="h-4 w-4 animate-spin" />}{editing ? 'Save changes' : 'Create'}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ── Adjust stock for a product in the active warehouse ── */
const ADJUST_TYPES = [
  { key: 'STOCK_IN', label: 'Stock In' },
  { key: 'STOCK_OUT', label: 'Stock Out' },
  { key: 'ADJUSTMENT', label: 'Set Qty' },
  { key: 'DAMAGED', label: 'Damaged' },
] as const;

function StockDialog({ product, warehouseId, warehouseName, onClose }: { product: Product; warehouseId: string; warehouseName: string; onClose: () => void }) {
  const qc = useQueryClient();
  const [type, setType] = useState<(typeof ADJUST_TYPES)[number]['key']>('STOCK_IN');
  const [quantity, setQuantity] = useState<number>(0);
  const [note, setNote] = useState('');

  const adjust = useMutation({
    mutationFn: async () => (await api.post('/stock/adjust', { productId: product.id, warehouseId, type, quantity, note })).data,
    onSuccess: (r) => {
      toast.success(`Stock updated — ${product.name}: ${r.newQty}`);
      qc.invalidateQueries({ queryKey: ['products'] });
      qc.invalidateQueries({ queryKey: ['warehouses'] });
      onClose();
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'Adjustment failed'),
  });

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Adjust Stock — {product.name}</DialogTitle>
          <DialogDescription>
            Warehouse: <span className="font-medium text-foreground">{warehouseName}</span> · Current on-hand: {product.currentStock}
          </DialogDescription>
        </DialogHeader>
        <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); adjust.mutate(); }}>
          <div className="grid grid-cols-4 gap-1.5">
            {ADJUST_TYPES.map((t) => (
              <Button key={t.key} type="button" size="sm" variant={type === t.key ? 'default' : 'outline'} onClick={() => setType(t.key)}>
                {t.label}
              </Button>
            ))}
          </div>
          <div className="space-y-1.5">
            <Label>{type === 'ADJUSTMENT' ? 'New on-hand quantity' : 'Quantity'}</Label>
            <Input type="number" step="0.001" min={0} required autoFocus value={quantity || ''} onChange={(e) => setQuantity(Number(e.target.value))} />
          </div>
          <div className="space-y-1.5">
            <Label>Note (optional)</Label>
            <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. opening stock, correction…" />
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={adjust.isPending}>{adjust.isPending && <Loader2 className="h-4 w-4 animate-spin" />}Apply</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function ProductsPage() {
  const [search, setSearch] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [stockFor, setStockFor] = useState<Product | null>(null);
  const { currentId, warehouses } = useWarehouses();
  const warehouseName = warehouses.find((w) => w.id === currentId)?.name ?? '—';

  const { data: products = [], isLoading } = useQuery<Product[]>({
    queryKey: ['products', search, currentId],
    queryFn: async () => (await api.get('/products', { params: { search, warehouseId: currentId } })).data,
    enabled: !!currentId,
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search products…" className="w-72 pl-8" />
          </div>
          <span className="text-sm text-muted-foreground">
            Stock for <span className="font-medium text-foreground">{warehouseName}</span>
          </span>
        </div>
        <Button onClick={() => { setEditing(null); setDialogOpen(true); }}>
          <Plus className="h-4 w-4" /> Add Product
        </Button>
      </div>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-3 font-medium">Product</th>
                <th className="px-4 py-3 font-medium">SKU</th>
                <th className="px-4 py-3 font-medium">Category</th>
                <th className="px-4 py-3 text-right font-medium">Purchase</th>
                <th className="px-4 py-3 text-right font-medium">Sale</th>
                <th className="px-4 py-3 text-right font-medium">Stock</th>
                <th className="px-4 py-3 text-right font-medium">Action</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && <tr><td colSpan={7} className="px-4 py-10 text-center text-muted-foreground">Loading…</td></tr>}
              {!isLoading && products.map((p) => (
                <tr key={p.id} className="border-b last:border-0 hover:bg-muted/30">
                  <td className="px-4 py-3 font-medium cursor-pointer" onClick={() => { setEditing(p); setDialogOpen(true); }}>{p.name}</td>
                  <td className="px-4 py-3 text-muted-foreground">{p.sku}</td>
                  <td className="px-4 py-3 text-muted-foreground">{p.category?.name ?? '—'}</td>
                  <td className="px-4 py-3 text-right">{formatCurrency(Number(p.purchasePrice))}</td>
                  <td className="px-4 py-3 text-right">{formatCurrency(Number(p.salePrice))}</td>
                  <td className="px-4 py-3 text-right">
                    <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium', p.isLowStock ? 'bg-destructive/10 text-destructive' : 'bg-success/10 text-success')}>
                      {p.isLowStock && <AlertTriangle className="h-3 w-3" />}
                      {p.currentStock} {p.unit?.abbreviation ?? ''}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Button size="sm" variant="outline" onClick={() => setStockFor(p)}>
                      <PackagePlus className="h-4 w-4" /> Stock
                    </Button>
                  </td>
                </tr>
              ))}
              {!isLoading && products.length === 0 && <tr><td colSpan={7} className="px-4 py-10 text-center text-muted-foreground">No products found.</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>

      {dialogOpen && <ProductDialog key={editing?.id ?? 'new'} open={dialogOpen} onOpenChange={setDialogOpen} editing={editing} />}
      {stockFor && currentId && <StockDialog product={stockFor} warehouseId={currentId} warehouseName={warehouseName} onClose={() => setStockFor(null)} />}
    </div>
  );
}
