import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Search, Plus, AlertTriangle, Loader2, Pencil, Trash2, ChevronDown } from 'lucide-react';
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
import { useStorefrontFilter } from '@/store/storefront';
import { Pagination } from '@/components/ui/pagination';
import { useLanguage } from '@/components/language-provider';

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
  warehouseId?: string;
  category?: { name: string };
  unit?: { abbreviation: string };
}

interface Catalog {
  categories: { id: string; name: string }[];
  brands: { id: string; name: string }[];
  units: { id: string; name: string; abbreviation: string }[];
}
const SEARCH_FETCH_LIMIT = 200;
const PAGE_SIZE = 20;

const blank = {
  name: '',
  sku: '',
  barcode: '',
  categoryId: '',
  unitId: '',
  warehouseId: '',
  purchasePrice: 0,
  salePrice: 0,
  taxRate: 0,
  minStock: 0,
};

/* ── Add / edit a product ── */
function ProductDialog({
  open,
  onOpenChange,
  editing,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  editing: Product | null;
}) {
  const qc = useQueryClient();
  const { t } = useLanguage();
  const { data: catalog } = useQuery<Catalog>({
    queryKey: ['catalog'],
    queryFn: async () => (await api.get('/catalog')).data,
  });
  const { warehouses, currentId } = useWarehouses();
  const [form, setForm] = useState(() =>
    editing
      ? {
          name: editing.name,
          sku: editing.sku,
          barcode: editing.barcode ?? '',
          categoryId: editing.categoryId ?? '',
          unitId: editing.unitId ?? '',
          warehouseId: editing.warehouseId ?? '',
          purchasePrice: Number(editing.purchasePrice),
          salePrice: Number(editing.salePrice),
          taxRate: Number(editing.taxRate),
          minStock: Number(editing.minStock),
        }
      : { ...blank, warehouseId: currentId ?? '' },
  );

  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        ...form,
        categoryId: form.categoryId || undefined,
        unitId: form.unitId || undefined,
        barcode: form.barcode || undefined,
        warehouseId: form.warehouseId,
      };
      return editing
        ? (await api.patch(`/products/${editing.id}`, payload)).data
        : (await api.post('/products', payload)).data;
    },
    onSuccess: () => {
      toast.success(
        editing ? 'Product updated' : 'Product created — use “Stock In” to add quantity',
      );
      qc.invalidateQueries({ queryKey: ['products'] });
      onOpenChange(false);
    },
    onError: (e: any) =>
      toast.error(e?.response?.data?.message?.[0] ?? e?.response?.data?.message ?? 'Save failed'),
  });

  const field = (k: keyof typeof form, v: any) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{editing ? 'Edit Product' : 'New Product'}</DialogTitle>
          <DialogDescription>
            {editing
              ? 'Update product details.'
              : 'Add a product to your catalog (stock is added separately).'}
          </DialogDescription>
        </DialogHeader>
        <form
          className="grid grid-cols-2 gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate();
          }}
        >
          <div className="col-span-2 space-y-1.5">
            <Label>Name *</Label>
            <Input required value={form.name} onChange={(e) => field('name', e.target.value)} />
          </div>
          <div className="col-span-2 space-y-1.5">
            <Label>Warehouse *</Label>
            <select
              required
              value={form.warehouseId}
              onChange={(e) => field('warehouseId', e.target.value)}
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
            >
              <option value="" disabled>
                Select warehouse…
              </option>
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label>SKU *</Label>
            <Input
              required
              value={form.sku}
              onChange={(e) => field('sku', e.target.value)}
              disabled={!!editing}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Barcode</Label>
            <Input value={form.barcode} onChange={(e) => field('barcode', e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Category</Label>
            <select
              value={form.categoryId}
              onChange={(e) => field('categoryId', e.target.value)}
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
            >
              <option value="">Select category</option>
              {catalog?.categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label>Unit</Label>
            <select
              value={form.unitId}
              onChange={(e) => field('unitId', e.target.value)}
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
            >
              <option value="">—</option>
              {catalog?.units.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name} ({u.abbreviation})
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label>Purchase Price *</Label>
            <Input
              type="number"
              step="0.01"
              min="0"
              required
              value={form.purchasePrice || ''}
              onChange={(e) => field('purchasePrice', Math.max(0, Number(e.target.value)))}
            />
          </div>
          {editing && (
            <div className="space-y-1.5">
              <Label>Sale Price</Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={form.salePrice || ''}
                onChange={(e) => field('salePrice', Math.max(0, Number(e.target.value)))}
              />
            </div>
          )}
          <div className="space-y-1.5">
            <Label>Tax %</Label>
            <Input
              type="number"
              step="0.01"
              min="0"
              value={form.taxRate || ''}
              onChange={(e) => field('taxRate', Math.max(0, Number(e.target.value)))}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Min Stock</Label>
            <Input
              type="number"
              min="0"
              value={form.minStock || ''}
              onChange={(e) => field('minStock', Math.max(0, Number(e.target.value)))}
            />
          </div>
          <div className="col-span-2 flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t('Cancel')}
            </Button>
            <Button type="submit" disabled={save.isPending}>
              {save.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              {editing ? t('Save changes') : t('Create')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function ProductsPage() {
  const { t } = useLanguage();
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [category, setCategory] = useState('');
  const [warehouse, setWarehouse] = useState('');
  const [page, setPage] = useState(1);
  const storefront = useStorefrontFilter();
  const { warehouses } = useWarehouses();
  const warehouseName = (id?: string) => warehouses.find((w) => w.id === id)?.name ?? '—';

  const { data: catalog } = useQuery<Catalog>({
    queryKey: ['catalog'],
    queryFn: async () => (await api.get('/catalog')).data,
  });

  const q = search.trim().toLowerCase();
  const isSearching = q.length > 0;
  const fetchPage = isSearching ? 1 : page;
  const fetchLimit = isSearching ? SEARCH_FETCH_LIMIT : PAGE_SIZE;

  const { data: products = [], isLoading } = useQuery<Product[]>({
    queryKey: ['products', search, category, warehouse, storefront.store],
    queryFn: async () =>
      (
        await api.get('/products', {
          params: {
            search,
            category: category || undefined,
            warehouse: warehouse || undefined,
            // An explicit warehouse pick is more specific than the storefront's
            // store scope — the backend prioritizes `store` over `warehouse`
            // when both are sent, which would otherwise silently ignore this
            // filter whenever a specific store is also selected up top.
            ...(warehouse ? {} : storefront),
          },
        })
      ).data,
  });
  const total = products?.length ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const del = useMutation({
    mutationFn: async (id: string) => (await api.delete(`/products/${id}`)).data,
    onSuccess: () => {
      toast.success('Product deleted');
      qc.invalidateQueries({ queryKey: ['products'] });
      qc.invalidateQueries({ queryKey: ['catalog'] });
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'Could not delete product'),
  });

  const remove = (p: Product) => {
    if (window.confirm(`Delete product "${p.name}"? This cannot be undone.`)) del.mutate(p.id);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-end gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs">{t('Search')}</Label>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t('Search products…')}
                className="w-72 pl-8"
              />
            </div>
          </div>
          <div className="relative">
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="h-9 w-48 appearance-none rounded-md border border-input bg-transparent py-1 pl-3 pr-9 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:border-input"
            >
              <option value="">{t('Category')}</option>
              {catalog?.categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          </div>
          <div className="relative">
            <select
              value={warehouse}
              onChange={(e) => setWarehouse(e.target.value)}
              className="h-9 w-48 appearance-none rounded-md border border-input bg-transparent py-1 pl-3 pr-9 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:border-input"
            >
              <option value="">{t('All Warehouses')}</option>
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          </div>
        </div>
        <Button
          onClick={() => {
            setEditing(null);
            setDialogOpen(true);
          }}
        >
          <Plus className="h-4 w-4" /> {t('Add Product')}
        </Button>
      </div>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-3 font-medium">{t('Product')}</th>
                <th className="px-4 py-3 font-medium">{t('SKU')}</th>
                <th className="px-4 py-3 font-medium">{t('Category')}</th>
                <th className="px-4 py-3 font-medium">{t('Warehouse')}</th>
                <th className="px-4 py-3 text-right font-medium">{t('Purchase')}</th>
                <th className="px-4 py-3 text-right font-medium">{t('Sale')}</th>
                <th className="px-4 py-3 text-right font-medium">{t('Stock')}</th>
                <th className="px-4 py-3 text-right font-medium">{t('Action')}</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-muted-foreground">
                    Loading…
                  </td>
                </tr>
              )}
              {!isLoading &&
                products.map((p) => (
                  <tr key={p.id} className="border-b last:border-0 hover:bg-muted/30">
                    <td
                      className="px-4 py-3 font-medium cursor-pointer"
                      onClick={() => {
                        setEditing(p);
                        setDialogOpen(true);
                      }}
                    >
                      {p.name}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{p.sku}</td>
                    <td className="px-4 py-3 text-muted-foreground">{p.category?.name ?? '—'}</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {/* When filtering by warehouse, the Stock column is scoped to
                          that warehouse — label the row with it too, rather than the
                          product's static owning warehouse, so the two stay consistent. */}
                      {warehouseName(warehouse || p.warehouseId)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {formatCurrency(Number(p.purchasePrice))}
                    </td>
                    <td className="px-4 py-3 text-right">{formatCurrency(Number(p.salePrice))}</td>
                    <td className="px-4 py-3 text-right">
                      <span
                        className={cn(
                          'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium',
                          p.isLowStock
                            ? 'bg-destructive/10 text-destructive'
                            : 'bg-success/10 text-success',
                        )}
                      >
                        {p.isLowStock && <AlertTriangle className="h-3 w-3" />}
                        {p.currentStock} {p.unit?.abbreviation ?? ''}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8"
                          title={t('Edit')}
                          onClick={() => {
                            setEditing(p);
                            setDialogOpen(true);
                          }}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8"
                          title={t('Delete')}
                          disabled={del.isPending}
                          onClick={() => remove(p)}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              {!isLoading && products.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-muted-foreground">
                    No products found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          {!isSearching && (
            <Pagination
              page={page}
              totalPages={totalPages}
              total={total}
              pageSize={PAGE_SIZE}
              onPageChange={setPage}
              className="border-t"
            />
          )}
        </div>
      </Card>

      {dialogOpen && (
        <ProductDialog
          key={editing?.id ?? 'new'}
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          editing={editing}
        />
      )}
    </div>
  );
}
