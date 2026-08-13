import { useEffect, useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2, Plus, Search, Truck, Trash2, Pencil, AlertTriangle } from 'lucide-react';
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
import { Pagination } from '@/components/ui/pagination';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/store/auth';
import { grantsPermission } from '@/lib/modules';
import { useWarehouses } from '@/components/layout/warehouse-switcher';
import { useStorefrontFilter, useStorefrontStore } from '@/store/storefront';
import { useLanguage } from '@/components/language-provider';

interface Vendor {
  id: string;
  name: string;
}

interface ProductOption {
  id: string;
  name: string;
  sku: string;
  currentStock: number;
}

interface ReceiptItem {
  productId: string;
  name: string;
  receivedQuantity: number;
  damagedQuantity: number;
}

interface StockReceipt {
  id: string;
  number: string;
  vendorId: string;
  vendorName: string;
  storeId?: string;
  storeName?: string;
  warehouseId: string;
  warehouseName: string;
  date: string;
  truck: { vehicleNumber: string; driverName: string; driverPhone: string };
  items: ReceiptItem[];
  note: string;
}

const PAGE_SIZE = 20;
const SEARCH_FETCH_LIMIT = 200;

/* ── New/edit truck delivery: vendor, truck details, and per-product received/damaged quantities ── */
function ReceiptDialog({ receipt, onClose }: { receipt?: StockReceipt; onClose: () => void }) {
  const qc = useQueryClient();
  const { t } = useLanguage();
  const editing = !!receipt;
  const { warehouses, currentId: defaultWarehouseId } = useWarehouses();
  const currentStoreId = useStorefrontStore((s) => s.currentStoreId);
  // A delivery is always received for one physical store — required on
  // create; an existing receipt's store never changes on edit.
  const hasSpecificStore = !!currentStoreId && currentStoreId !== 'ALL';
  const [vendorId, setVendorId] = useState(receipt?.vendorId ?? '');
  const [warehouseId, setWarehouseId] = useState(receipt?.warehouseId ?? '');
  const [date, setDate] = useState(
    () => receipt?.date.slice(0, 10) ?? new Date().toISOString().slice(0, 10),
  );
  const [vehicleNumber, setVehicleNumber] = useState(receipt?.truck.vehicleNumber ?? '');
  const [driverName, setDriverName] = useState(receipt?.truck.driverName ?? '');
  const [driverPhone, setDriverPhone] = useState(receipt?.truck.driverPhone ?? '');
  const [note, setNote] = useState(receipt?.note ?? '');
  const [items, setItems] = useState<ReceiptItem[]>(
    () =>
      receipt?.items.map((it) => ({
        productId: it.productId,
        name: it.name,
        receivedQuantity: it.receivedQuantity,
        damagedQuantity: it.damagedQuantity,
      })) ?? [],
  );
  const [productSearch, setProductSearch] = useState('');
  const [productPickerOpen, setProductPickerOpen] = useState(false);
  const productSearchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!editing && !warehouseId && defaultWarehouseId) setWarehouseId(defaultWarehouseId);
  }, [editing, warehouseId, defaultWarehouseId]);

  const { data: vendors = [] } = useQuery<Vendor[]>({
    queryKey: ['vendors-select'],
    queryFn: async () => (await api.get('/vendors')).data,
  });
  const { data: products = [] } = useQuery<ProductOption[]>({
    queryKey: ['stock-receipt-products', productSearch],
    queryFn: async () => (await api.get('/products', { params: { search: productSearch } })).data,
  });

  const addItem = (p: ProductOption) => {
    setProductSearch('');
    setProductPickerOpen(false);
    productSearchRef.current?.blur();
    setItems((rows) => {
      if (rows.some((r) => r.productId === p.id)) return rows;
      return [...rows, { productId: p.id, name: p.name, receivedQuantity: 1, damagedQuantity: 0 }];
    });
  };
  const patchItem = (productId: string, patch: Partial<ReceiptItem>) =>
    setItems((rows) => rows.map((r) => (r.productId === productId ? { ...r, ...patch } : r)));
  const removeItem = (productId: string) =>
    setItems((rows) => rows.filter((r) => r.productId !== productId));

  const save = useMutation({
    mutationFn: async () => {
      if (!editing && !hasSpecificStore) {
        throw new Error('Select a specific store from the header before recording a receipt.');
      }
      const payload = {
        storeId: currentStoreId,
        vendorId,
        warehouseId,
        date,
        truck: {
          vehicleNumber,
          driverName: driverName || undefined,
          driverPhone: driverPhone || undefined,
        },
        items: items.map((r) => ({
          productId: r.productId,
          receivedQuantity: r.receivedQuantity || 0,
          damagedQuantity: r.damagedQuantity || 0,
        })),
        note: note || undefined,
      };
      return (
        editing
          ? await api.patch(`/stock-receipts/${receipt!.id}`, payload)
          : await api.post('/stock-receipts', payload)
      ).data;
    },
    onSuccess: () => {
      toast.success(editing ? 'Stock receipt updated' : 'Stock receipt recorded');
      qc.invalidateQueries({ queryKey: ['stock-receipts'] });
      qc.invalidateQueries({ queryKey: ['products'] });
      qc.invalidateQueries({ queryKey: ['warehouses'] });
      onClose();
    },
    onError: (e: any) =>
      toast.error(
        e?.response?.data?.message?.[0] ??
          e?.response?.data?.message ??
          e?.message ??
          'Could not save',
      ),
  });

  const canSubmit =
    (editing || hasSpecificStore) &&
    vendorId &&
    warehouseId &&
    vehicleNumber.trim() &&
    items.length > 0 &&
    items.every((r) => r.receivedQuantity > 0 || r.damagedQuantity > 0);

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Truck className="h-4 w-4" /> {editing ? 'Edit Stock Receipt' : 'New Stock Receipt'}
          </DialogTitle>
          <DialogDescription>
            {editing
              ? 'Update this truck delivery — quantities are reconciled against current stock.'
              : "Record a truck delivery from a vendor — how much of each product arrived good versus damaged. Damaged quantities are logged for tracking only; they don't add to stock."}
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (canSubmit) save.mutate();
          }}
        >
          {!editing && !hasSpecificStore && (
            <div className="flex items-center gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              Select a specific store from the header before recording a receipt — "All Stores"
              can't be recorded on a delivery.
            </div>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Vendor *</Label>
              <select
                required
                value={vendorId}
                onChange={(e) => setVendorId(e.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
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
              <Label>Receiving Warehouse *</Label>
              <select
                required
                value={warehouseId}
                onChange={(e) => setWarehouseId(e.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
              >
                <option value="">Select warehouse…</option>
                {warehouses.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>Date</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Truck / Vehicle Number *</Label>
              <Input
                required
                value={vehicleNumber}
                onChange={(e) => setVehicleNumber(e.target.value)}
                placeholder="e.g. LEA-1234"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Driver Name</Label>
              <Input value={driverName} onChange={(e) => setDriverName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Driver Phone</Label>
              <Input value={driverPhone} onChange={(e) => setDriverPhone(e.target.value)} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Products</Label>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                ref={productSearchRef}
                value={productSearch}
                onChange={(e) => setProductSearch(e.target.value)}
                onFocus={() => setProductPickerOpen(true)}
                onBlur={() => setTimeout(() => setProductPickerOpen(false), 150)}
                placeholder="Click to browse, or type to search products…"
                className="pl-8"
              />
              {productPickerOpen && (
                <div className="absolute z-10 mt-1 max-h-56 w-full overflow-y-auto rounded-md border bg-popover shadow-md">
                  {products.length === 0 ? (
                    <p className="px-3 py-3 text-sm text-muted-foreground">
                      No products found{productSearch ? ` for "${productSearch}"` : ''}.
                    </p>
                  ) : (
                    products.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => addItem(p)}
                        className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-accent"
                      >
                        <span>{p.name}</span>
                        <span className="text-xs text-muted-foreground">{p.sku}</span>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>

            {items.length > 0 && (
              <div className="rounded-md border">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50 text-left text-xs uppercase text-muted-foreground">
                      <th className="px-3 py-2 font-medium">{t('Product')}</th>
                      <th className="px-3 py-2 font-medium">{t('Qty Received')}</th>
                      <th className="px-3 py-2 font-medium">{t('Qty Damaged')}</th>
                      <th className="w-8" />
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((r) => (
                      <tr key={r.productId} className="border-b last:border-0">
                        <td className="px-3 py-2">{r.name}</td>
                        <td className="px-3 py-2">
                          <Input
                            type="number"
                            min={0}
                            step="any"
                            className="h-8 w-24"
                            value={r.receivedQuantity || ''}
                            onChange={(e) =>
                              patchItem(r.productId, { receivedQuantity: Number(e.target.value) })
                            }
                          />
                        </td>
                        <td className="px-3 py-2">
                          <Input
                            type="number"
                            min={0}
                            step="any"
                            className="h-8 w-24"
                            value={r.damagedQuantity || ''}
                            onChange={(e) =>
                              patchItem(r.productId, { damagedQuantity: Number(e.target.value) })
                            }
                          />
                        </td>
                        <td className="px-3 py-2 text-right">
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7 text-destructive"
                            onClick={() => removeItem(r.productId)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <Label>Note (optional)</Label>
            <Input value={note} onChange={(e) => setNote(e.target.value)} />
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <DialogClose asChild>
              <Button type="button" variant="outline">
                {t('Cancel')}
              </Button>
            </DialogClose>
            <Button type="submit" disabled={!canSubmit || save.isPending}>
              {save.isPending && <Loader2 className="h-4 w-4 animate-spin" />}{' '}
              {editing ? t('Save Changes') : t('Save Receipt')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function StockReceiptsPage() {
  const qc = useQueryClient();
  const { t } = useLanguage();
  const authUser = useAuthStore((s) => s.user);
  const canManage = grantsPermission(authUser?.permissions, 'inventory:manage');

  const [tab, setTab] = useState<'in' | 'damaged'>('in');
  const [search, setSearch] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);
  const [editingReceipt, setEditingReceipt] = useState<StockReceipt | null>(null);
  const storefront = useStorefrontFilter();

  const q = search.trim().toLowerCase();
  const isSearching = q.length > 0;
  const fetchPage = isSearching ? 1 : page;
  const fetchLimit = isSearching ? SEARCH_FETCH_LIMIT : PAGE_SIZE;

  useEffect(() => {
    setPage(1);
  }, [from, to, search]);

  const { data, isLoading } = useQuery({
    queryKey: ['stock-receipts', from, to, search, fetchPage, fetchLimit, storefront.store],
    queryFn: async () =>
      (
        await api.get('/stock-receipts', {
          params: {
            from,
            to,
            search: search || undefined,
            page: fetchPage,
            limit: fetchLimit,
            ...storefront,
          },
        })
      ).data as { receipts: StockReceipt[]; total: number },
  });
  const receipts = data?.receipts ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const stockInRows = receipts.flatMap((r) =>
    r.items.filter((it) => it.receivedQuantity > 0).map((it) => ({ receipt: r, item: it })),
  );
  const damagedRows = receipts.flatMap((r) =>
    r.items.filter((it) => it.damagedQuantity > 0).map((it) => ({ receipt: r, item: it })),
  );
  const rows = tab === 'in' ? stockInRows : damagedRows;

  const del = useMutation({
    mutationFn: async (id: string) => (await api.delete(`/stock-receipts/${id}`)).data,
    onSuccess: () => {
      toast.success('Stock receipt deleted');
      qc.invalidateQueries({ queryKey: ['stock-receipts'] });
      qc.invalidateQueries({ queryKey: ['products'] });
      qc.invalidateQueries({ queryKey: ['warehouses'] });
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'Could not delete this receipt'),
  });

  const removeReceipt = (r: StockReceipt) => {
    if (
      window.confirm(
        `Delete receipt ${r.number}? This reverses the stock it added and cannot be undone.`,
      )
    ) {
      del.mutate(r.id);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-1 border-b">
        {(
          [
            { key: 'in', label: 'Stock In' },
            { key: 'damaged', label: 'Damaged Stock' },
          ] as const
        ).map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={cn(
              '-mb-px border-b-2 px-3 py-2 text-sm font-medium',
              tab === t.key
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-end justify-between gap-4">
        <p className="text-sm text-muted-foreground">{rows.length} line item(s)</p>
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1.5">
            <Label>From</Label>
            <Input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="w-40"
            />
          </div>
          <div className="space-y-1.5">
            <Label>To</Label>
            <Input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="w-40"
            />
          </div>
          <div className="w-64 space-y-1.5">
            <Label>{t('Search')}</Label>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t('Search by receipt #, vendor or truck…')}
                className="pl-8"
              />
            </div>
          </div>
          {canManage && (
            <Button onClick={() => setCreating(true)}>
              <Plus className="h-4 w-4" /> {t('New Receipt')}
            </Button>
          )}
        </div>
      </div>

      <Card className="overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th className="px-4 py-3 font-medium">{t('Receipt #')}</th>
              <th className="px-4 py-3 font-medium">{t('Date')}</th>
              <th className="px-4 py-3 font-medium">{t('Vendor')}</th>
              <th className="px-4 py-3 font-medium">{t('Store')}</th>
              <th className="px-4 py-3 font-medium">{t('Warehouse')}</th>
              <th className="px-4 py-3 font-medium">{t('Truck')}</th>
              <th className="px-4 py-3 font-medium">{t('Product')}</th>
              <th className="px-4 py-3 text-right font-medium">
                {tab === 'in' ? t('Qty Received') : t('Qty Damaged')}
              </th>
              {canManage && <th className="px-4 py-3 text-right font-medium">{t('Actions')}</th>}
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td
                  colSpan={canManage ? 9 : 8}
                  className="px-4 py-10 text-center text-muted-foreground"
                >
                  Loading…
                </td>
              </tr>
            )}
            {!isLoading &&
              rows.map(({ receipt, item }) => (
                <tr
                  key={`${receipt.id}-${item.productId}`}
                  className="border-b last:border-0 hover:bg-muted/30"
                >
                  <td className="px-4 py-3 font-medium">{receipt.number}</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {new Date(receipt.date).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{receipt.vendorName}</td>
                  <td className="px-4 py-3 text-muted-foreground">{receipt.storeName ?? '—'}</td>
                  <td className="px-4 py-3 text-muted-foreground">{receipt.warehouseName}</td>
                  <td className="px-4 py-3 text-muted-foreground">{receipt.truck.vehicleNumber}</td>
                  <td className="px-4 py-3">{item.name}</td>
                  <td className="px-4 py-3 text-right tabular-nums font-medium">
                    {tab === 'in' ? item.receivedQuantity : item.damagedQuantity}
                  </td>
                  {canManage && (
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          title={t('Edit')}
                          onClick={() => setEditingReceipt(receipt)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          title={t('Delete')}
                          disabled={del.isPending}
                          onClick={() => removeReceipt(receipt)}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            {!isLoading && rows.length === 0 && (
              <tr>
                <td
                  colSpan={canManage ? 9 : 8}
                  className="px-4 py-10 text-center text-muted-foreground"
                >
                  {tab === 'in' ? 'No stock received yet.' : 'No damaged stock recorded yet.'}
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
      </Card>

      {creating && <ReceiptDialog onClose={() => setCreating(false)} />}
      {editingReceipt && (
        <ReceiptDialog receipt={editingReceipt} onClose={() => setEditingReceipt(null)} />
      )}
    </div>
  );
}
